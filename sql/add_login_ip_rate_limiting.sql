-- ================================================
-- Patch: Mitigate account-lockout DoS in record_failed_login
-- Purpose: Prevent a single IP from spamming failed-login records
-- Safe to run multiple times
-- ================================================

-- Step 1: Create an IP-based attempts table for login failures
CREATE TABLE IF NOT EXISTS login_ip_attempts (
    id BIGSERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

ALTER TABLE login_ip_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_login_ip_attempts_window_start
    ON login_ip_attempts (window_start);
CREATE INDEX IF NOT EXISTS idx_login_ip_attempts_locked_until
    ON login_ip_attempts (locked_until);

-- Step 2: Recreate record_failed_login with per-IP throttle before per-email lockout
CREATE OR REPLACE FUNCTION record_failed_login(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    normalized_email TEXT := lower(trim(user_email));
    attempt_record RECORD;
    new_count INTEGER;
    lockout_time TIMESTAMPTZ;
    max_attempts INTEGER := 10; -- per-email lockout threshold
    lockout_minutes INTEGER := 5; -- per-email lockout duration

    request_headers JSONB := '{}'::JSONB;
    raw_forwarded_for TEXT;
    client_ip TEXT;
    ip_attempt_record RECORD;
    ip_new_count INTEGER;
    ip_max_attempts INTEGER := 30; -- per-IP failed-login records per window
    ip_window_minutes INTEGER := 15;
    ip_retry_after TIMESTAMPTZ;
BEGIN
    IF normalized_email IS NULL OR normalized_email = '' THEN
        RETURN json_build_object(
            'locked', false,
            'attempts', 0,
            'attempts_remaining', max_attempts
        );
    END IF;

    -- Read request headers safely and extract the left-most forwarded IP.
    BEGIN
        request_headers := COALESCE(
            NULLIF(current_setting('request.headers', true), '')::JSONB,
            '{}'::JSONB
        );
    EXCEPTION WHEN OTHERS THEN
        request_headers := '{}'::JSONB;
    END;

    raw_forwarded_for := COALESCE(
        request_headers->>'x-forwarded-for',
        request_headers->>'x-real-ip',
        request_headers->>'cf-connecting-ip',
        ''
    );
    client_ip := NULLIF(trim(split_part(raw_forwarded_for, ',', 1)), '');

    IF client_ip IS NULL THEN
        client_ip := 'unknown';
    END IF;

    -- IP limiter: if this IP is abusive, skip email counter increments.
    SELECT * INTO ip_attempt_record
    FROM login_ip_attempts
    WHERE ip_address = client_ip
    LIMIT 1
    FOR UPDATE;

    IF ip_attempt_record IS NULL THEN
        INSERT INTO login_ip_attempts (ip_address, attempt_count, window_start, locked_until)
        VALUES (client_ip, 1, NOW(), NULL)
        ON CONFLICT (ip_address) DO UPDATE
        SET attempt_count = 1,
            window_start = NOW(),
            locked_until = NULL;
    ELSIF ip_attempt_record.locked_until IS NOT NULL AND ip_attempt_record.locked_until > NOW() THEN
        RETURN json_build_object(
            'locked', false,
            'attempts', 0,
            'attempts_remaining', max_attempts,
            'ip_limited', true,
            'seconds_remaining', EXTRACT(EPOCH FROM (ip_attempt_record.locked_until - NOW()))::INTEGER
        );
    ELSIF (NOW() - ip_attempt_record.window_start) > (ip_window_minutes || ' minutes')::INTERVAL
       OR (ip_attempt_record.locked_until IS NOT NULL AND ip_attempt_record.locked_until <= NOW()) THEN
        UPDATE login_ip_attempts
        SET attempt_count = 1,
            window_start = NOW(),
            locked_until = NULL
        WHERE ip_address = client_ip;
    ELSE
        ip_new_count := ip_attempt_record.attempt_count + 1;

        IF ip_new_count >= ip_max_attempts THEN
            ip_retry_after := ip_attempt_record.window_start + (ip_window_minutes || ' minutes')::INTERVAL;

            UPDATE login_ip_attempts
            SET attempt_count = ip_new_count,
                locked_until = ip_retry_after
            WHERE ip_address = client_ip;

            RETURN json_build_object(
                'locked', false,
                'attempts', 0,
                'attempts_remaining', max_attempts,
                'ip_limited', true,
                'seconds_remaining', EXTRACT(EPOCH FROM (ip_retry_after - NOW()))::INTEGER
            );
        END IF;

        UPDATE login_ip_attempts
        SET attempt_count = ip_new_count
        WHERE ip_address = client_ip;
    END IF;

    -- Existing per-email lockout logic follows.
    SELECT * INTO attempt_record
    FROM login_attempts
    WHERE email = normalized_email
    LIMIT 1;

    IF attempt_record IS NULL OR
       (attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW()) THEN

        INSERT INTO login_attempts (email, attempt_count, last_attempt_at)
        VALUES (normalized_email, 1, NOW())
        ON CONFLICT (email) DO UPDATE
        SET attempt_count = 1,
            locked_until = NULL,
            last_attempt_at = NOW();

        RETURN json_build_object(
            'locked', false,
            'attempts', 1,
            'attempts_remaining', max_attempts - 1
        );
    END IF;

    new_count := attempt_record.attempt_count + 1;

    IF new_count >= max_attempts THEN
        lockout_time := NOW() + (lockout_minutes || ' minutes')::INTERVAL;

        UPDATE login_attempts
        SET attempt_count = new_count,
            locked_until = lockout_time,
            last_attempt_at = NOW()
        WHERE email = normalized_email;

        RETURN json_build_object(
            'locked', true,
            'attempts', new_count,
            'locked_until', lockout_time,
            'seconds_remaining', EXTRACT(EPOCH FROM (lockout_time - NOW()))::INTEGER
        );
    END IF;

    UPDATE login_attempts
    SET attempt_count = new_count,
        last_attempt_at = NOW()
    WHERE email = normalized_email;

    RETURN json_build_object(
        'locked', false,
        'attempts', new_count,
        'attempts_remaining', max_attempts - new_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep failed-login recording server-side through the Edge Function.
REVOKE ALL ON FUNCTION record_failed_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_failed_login(TEXT) TO service_role;

SELECT 'Login DoS mitigation patch applied: record_failed_login now enforces per-IP throttling.' AS status;
