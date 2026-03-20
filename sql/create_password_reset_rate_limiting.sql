-- ================================================
-- Password Reset Rate Limiting
-- Run this in Supabase SQL Editor to enable rate limiting for forgot password requests
-- ================================================

-- Step 1: Create the password_reset_attempts table
CREATE TABLE IF NOT EXISTS password_reset_attempts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

-- Step 2: Enable RLS on the table
ALTER TABLE password_reset_attempts ENABLE ROW LEVEL SECURITY;

-- Step 2b: Add indexes for frequently-queried timestamp columns
CREATE INDEX IF NOT EXISTS idx_password_reset_attempts_window_start
    ON password_reset_attempts (window_start);
CREATE INDEX IF NOT EXISTS idx_password_reset_attempts_locked_until
    ON password_reset_attempts (locked_until);

-- Step 2c: Create a separate IP-based limiter table for server-side abuse control
CREATE TABLE IF NOT EXISTS password_reset_ip_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

ALTER TABLE password_reset_ip_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_password_reset_ip_attempts_window_start
    ON password_reset_ip_attempts (window_start);
CREATE INDEX IF NOT EXISTS idx_password_reset_ip_attempts_locked_until
    ON password_reset_ip_attempts (locked_until);

-- Step 3: Allow anon/authenticated roles to call the SECURITY DEFINER functions
-- (no direct table access needed for end users)

-- Step 4: Create the function to check if a reset request is allowed
CREATE OR REPLACE FUNCTION check_password_reset_rate_limit(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    attempt_record RECORD;
    max_attempts   INTEGER := 3;    -- max reset requests per window
    window_minutes INTEGER := 15;   -- rolling window in minutes
BEGIN
    SELECT * INTO attempt_record
    FROM password_reset_attempts
    WHERE email = user_email
    LIMIT 1;

    -- No record yet → allow
    IF attempt_record IS NULL THEN
        RETURN json_build_object(
            'allowed', true,
            'attempts', 0,
            'retry_after', NULL
        );
    END IF;

    -- Explicit cooldown still active
    IF attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until > NOW() THEN
        RETURN json_build_object(
            'allowed', false,
            'attempts', attempt_record.attempt_count,
            'retry_after', attempt_record.locked_until,
            'seconds_remaining', EXTRACT(EPOCH FROM (attempt_record.locked_until - NOW()))::INTEGER
        );
    END IF;

    -- Rolling window expired → reset counters
    IF (NOW() - attempt_record.window_start) > (window_minutes || ' minutes')::INTERVAL THEN
        UPDATE password_reset_attempts
        SET attempt_count = 0,
            window_start  = NOW(),
            locked_until  = NULL
        WHERE email = user_email;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 0,
            'retry_after', NULL
        );
    END IF;

    -- Within window: check count
    IF attempt_record.attempt_count >= max_attempts THEN
        RETURN json_build_object(
            'allowed', false,
            'attempts', attempt_record.attempt_count,
            'retry_after', attempt_record.window_start + (window_minutes || ' minutes')::INTERVAL,
            'seconds_remaining', EXTRACT(EPOCH FROM (attempt_record.window_start + (window_minutes || ' minutes')::INTERVAL - NOW()))::INTEGER
        );
    END IF;

    RETURN json_build_object(
        'allowed', true,
        'attempts', attempt_record.attempt_count,
        'retry_after', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the function to record a password reset attempt
CREATE OR REPLACE FUNCTION record_password_reset_attempt(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    attempt_record RECORD;
    new_count      INTEGER;
    max_attempts   INTEGER := 3;
    window_minutes INTEGER := 15;
    retry_after    TIMESTAMPTZ;
BEGIN
    SELECT * INTO attempt_record
    FROM password_reset_attempts
    WHERE email = user_email
    LIMIT 1;

    -- No record → insert first attempt
    IF attempt_record IS NULL THEN
        INSERT INTO password_reset_attempts (email, attempt_count, window_start)
        VALUES (user_email, 1, NOW())
        ON CONFLICT (email) DO UPDATE
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    -- Rolling window expired → reset and count as first attempt
    IF (NOW() - attempt_record.window_start) > (window_minutes || ' minutes')::INTERVAL OR
       (attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW()) THEN

        UPDATE password_reset_attempts
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL
        WHERE email = user_email;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    new_count := attempt_record.attempt_count + 1;

    IF new_count >= max_attempts THEN
        retry_after := attempt_record.window_start + (window_minutes || ' minutes')::INTERVAL;

        UPDATE password_reset_attempts
        SET attempt_count = new_count,
            locked_until  = retry_after
        WHERE email = user_email;

        RETURN json_build_object(
            'allowed', false,
            'attempts', new_count,
            'attempts_remaining', 0,
            'retry_after', retry_after,
            'seconds_remaining', EXTRACT(EPOCH FROM (retry_after - NOW()))::INTEGER
        );
    END IF;

    UPDATE password_reset_attempts
    SET attempt_count = new_count
    WHERE email = user_email;

    RETURN json_build_object(
        'allowed', true,
        'attempts', new_count,
        'attempts_remaining', max_attempts - new_count,
        'retry_after', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create an atomic function that checks and consumes an attempt in one call
-- This is safer for client flows because it avoids separate check/record race conditions.
CREATE OR REPLACE FUNCTION consume_password_reset_rate_limit(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    normalized_email TEXT := lower(trim(user_email));
    attempt_record RECORD;
    new_count      INTEGER;
    max_attempts   INTEGER := 3;
    window_minutes INTEGER := 15;
    retry_after    TIMESTAMPTZ;
BEGIN
    IF normalized_email IS NULL OR normalized_email = '' THEN
        RETURN json_build_object(
            'allowed', false,
            'attempts', 0,
            'attempts_remaining', 0,
            'retry_after', NOW() + INTERVAL '1 minute',
            'seconds_remaining', 60
        );
    END IF;

    SELECT * INTO attempt_record
    FROM password_reset_attempts
    WHERE email = normalized_email
    LIMIT 1
    FOR UPDATE;

    -- No record -> count this as first attempt
    IF attempt_record IS NULL THEN
        INSERT INTO password_reset_attempts (email, attempt_count, window_start, locked_until)
        VALUES (normalized_email, 1, NOW(), NULL)
        ON CONFLICT (email) DO UPDATE
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    -- Active lockout/cooldown
    IF attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until > NOW() THEN
        RETURN json_build_object(
            'allowed', false,
            'attempts', attempt_record.attempt_count,
            'attempts_remaining', 0,
            'retry_after', attempt_record.locked_until,
            'seconds_remaining', EXTRACT(EPOCH FROM (attempt_record.locked_until - NOW()))::INTEGER
        );
    END IF;

    -- Window expired or lockout expired -> reset and count this request as attempt 1
    IF (NOW() - attempt_record.window_start) > (window_minutes || ' minutes')::INTERVAL OR
       (attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW()) THEN

        UPDATE password_reset_attempts
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL
        WHERE email = normalized_email;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    new_count := attempt_record.attempt_count + 1;

    -- Hit limit: lock until end of window
    IF new_count >= max_attempts THEN
        retry_after := attempt_record.window_start + (window_minutes || ' minutes')::INTERVAL;

        UPDATE password_reset_attempts
        SET attempt_count = new_count,
            locked_until  = retry_after
        WHERE email = normalized_email;

        RETURN json_build_object(
            'allowed', false,
            'attempts', new_count,
            'attempts_remaining', 0,
            'retry_after', retry_after,
            'seconds_remaining', EXTRACT(EPOCH FROM (retry_after - NOW()))::INTEGER
        );
    END IF;

    -- Still under limit: consume one attempt
    UPDATE password_reset_attempts
    SET attempt_count = new_count
    WHERE email = normalized_email;

    RETURN json_build_object(
        'allowed', true,
        'attempts', new_count,
        'attempts_remaining', max_attempts - new_count,
        'retry_after', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create an atomic IP limiter for password reset requests
CREATE OR REPLACE FUNCTION consume_password_reset_ip_rate_limit(client_ip TEXT)
RETURNS JSON AS $$
DECLARE
    normalized_ip   TEXT := nullif(trim(client_ip), '');
    attempt_record  RECORD;
    new_count       INTEGER;
    max_attempts    INTEGER := 20;
    window_minutes  INTEGER := 15;
    retry_after     TIMESTAMPTZ;
BEGIN
    IF normalized_ip IS NULL THEN
        normalized_ip := 'unknown';
    END IF;

    SELECT * INTO attempt_record
    FROM password_reset_ip_attempts
    WHERE ip_address = normalized_ip
    LIMIT 1
    FOR UPDATE;

    IF attempt_record IS NULL THEN
        INSERT INTO password_reset_ip_attempts (ip_address, attempt_count, window_start, locked_until)
        VALUES (normalized_ip, 1, NOW(), NULL)
        ON CONFLICT (ip_address) DO UPDATE
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    IF attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until > NOW() THEN
        RETURN json_build_object(
            'allowed', false,
            'attempts', attempt_record.attempt_count,
            'attempts_remaining', 0,
            'retry_after', attempt_record.locked_until,
            'seconds_remaining', EXTRACT(EPOCH FROM (attempt_record.locked_until - NOW()))::INTEGER
        );
    END IF;

    IF (NOW() - attempt_record.window_start) > (window_minutes || ' minutes')::INTERVAL OR
       (attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW()) THEN

        UPDATE password_reset_ip_attempts
        SET attempt_count = 1,
            window_start  = NOW(),
            locked_until  = NULL
        WHERE ip_address = normalized_ip;

        RETURN json_build_object(
            'allowed', true,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1,
            'retry_after', NULL
        );
    END IF;

    new_count := attempt_record.attempt_count + 1;

    IF new_count >= max_attempts THEN
        retry_after := attempt_record.window_start + (window_minutes || ' minutes')::INTERVAL;

        UPDATE password_reset_ip_attempts
        SET attempt_count = new_count,
            locked_until  = retry_after
        WHERE ip_address = normalized_ip;

        RETURN json_build_object(
            'allowed', false,
            'attempts', new_count,
            'attempts_remaining', 0,
            'retry_after', retry_after,
            'seconds_remaining', EXTRACT(EPOCH FROM (retry_after - NOW()))::INTEGER
        );
    END IF;

    UPDATE password_reset_ip_attempts
    SET attempt_count = new_count
    WHERE ip_address = normalized_ip;

    RETURN json_build_object(
        'allowed', true,
        'attempts', new_count,
        'attempts_remaining', max_attempts - new_count,
        'retry_after', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 8: Grant execute permissions
-- Legacy helper functions remain callable by anon/authenticated.
GRANT EXECUTE ON FUNCTION check_password_reset_rate_limit(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_password_reset_attempt(TEXT) TO anon, authenticated;

-- Atomic consume functions are server-only through the Edge Function.
REVOKE ALL ON FUNCTION consume_password_reset_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION consume_password_reset_ip_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_password_reset_rate_limit(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION consume_password_reset_ip_rate_limit(TEXT) TO service_role;

-- Done
SELECT 'Password reset rate limiting applied successfully.' AS status;
