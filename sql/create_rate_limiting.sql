-- ================================================
-- FIX SCRIPT: Add UNIQUE constraint and clean up duplicates
-- Run this in Supabase SQL Editor to fix the existing table
-- ================================================

-- Step 1: Delete any duplicate records (keep only the most recent one per email)
DELETE FROM login_attempts
WHERE id NOT IN (
    SELECT DISTINCT ON (email) id
    FROM login_attempts
    ORDER BY email, last_attempt_at DESC
);

-- Step 2: Add UNIQUE constraint to email column (safe to re-run)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'login_attempts_email_unique'
          AND conrelid = 'login_attempts'::regclass
    ) THEN
        ALTER TABLE login_attempts
        ADD CONSTRAINT login_attempts_email_unique UNIQUE (email);
    END IF;
END;
$$;

-- Step 3: Verify the constraint was added
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'login_attempts';

-- Step 4: Drop and recreate the functions to ensure they use the latest logic

-- Drop existing functions first
DROP FUNCTION IF EXISTS record_failed_login(TEXT);
DROP FUNCTION IF EXISTS check_login_lockout(TEXT);
DROP FUNCTION IF EXISTS clear_failed_login(TEXT);
DROP FUNCTION IF EXISTS clear_failed_login();

-- Recreate check_login_lockout function
CREATE OR REPLACE FUNCTION check_login_lockout(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    attempt_record RECORD;
    result JSON;
BEGIN
    -- Get the latest attempt record for this email
    SELECT * INTO attempt_record
    FROM login_attempts
    WHERE email = user_email
    LIMIT 1;

    -- If no record exists, user is not locked
    IF attempt_record IS NULL THEN
        RETURN json_build_object(
            'locked', false,
            'attempts', 0,
            'locked_until', NULL
        );
    END IF;

    -- Check if lockout period has expired
    IF attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until > NOW() THEN
        RETURN json_build_object(
            'locked', true,
            'attempts', attempt_record.attempt_count,
            'locked_until', attempt_record.locked_until,
            'seconds_remaining', EXTRACT(EPOCH FROM (attempt_record.locked_until - NOW()))::INTEGER
        );
    END IF;

    -- If lockout expired, reset the record
    IF attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW() THEN
        UPDATE login_attempts
        SET attempt_count = 0,
            locked_until = NULL,
            last_attempt_at = NOW()
        WHERE email = user_email;
        
        RETURN json_build_object(
            'locked', false,
            'attempts', 0,
            'locked_until', NULL
        );
    END IF;

    -- Not locked, return current attempt count
    RETURN json_build_object(
        'locked', false,
        'attempts', attempt_record.attempt_count,
        'locked_until', NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate record_failed_login function with FIXED seconds_remaining calculation
CREATE OR REPLACE FUNCTION record_failed_login(user_email TEXT)
RETURNS JSON AS $$
DECLARE
    attempt_record RECORD;
    new_count INTEGER;
    lockout_time TIMESTAMPTZ;
    max_attempts INTEGER := 10; -- Maximum failed attempts before lockout
    lockout_minutes INTEGER := 1; -- Lockout duration in minutes
BEGIN
    -- Get current attempt record
    SELECT * INTO attempt_record
    FROM login_attempts
    WHERE email = user_email
    LIMIT 1;

    -- If no record or lockout expired, create new record
    IF attempt_record IS NULL OR 
       (attempt_record.locked_until IS NOT NULL AND attempt_record.locked_until <= NOW()) THEN
        
        -- Use INSERT...ON CONFLICT (now works because email is UNIQUE!)
        INSERT INTO login_attempts (email, attempt_count, last_attempt_at)
        VALUES (user_email, 1, NOW())
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

    -- Increment attempt count
    new_count := attempt_record.attempt_count + 1;

    -- Check if we should lock the account
    IF new_count >= max_attempts THEN
        lockout_time := NOW() + (lockout_minutes || ' minutes')::INTERVAL;
        
        UPDATE login_attempts
        SET attempt_count = new_count,
            locked_until = lockout_time,
            last_attempt_at = NOW()
        WHERE email = user_email;
        
        RETURN json_build_object(
            'locked', true,
            'attempts', new_count,
            'locked_until', lockout_time,
            'seconds_remaining', EXTRACT(EPOCH FROM (lockout_time - NOW()))::INTEGER
        );
    ELSE
        -- Just increment the count
        UPDATE login_attempts
        SET attempt_count = new_count,
            last_attempt_at = NOW()
        WHERE email = user_email;
        
        RETURN json_build_object(
            'locked', false,
            'attempts', new_count,
            'attempts_remaining', max_attempts - new_count
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate clear_failed_login function (authenticated user only)
CREATE OR REPLACE FUNCTION clear_failed_login()
RETURNS VOID AS $$
DECLARE
    calling_user_id UUID;
    calling_user_email TEXT;
BEGIN
    calling_user_id := auth.uid();

    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT email INTO calling_user_email
    FROM auth.users
    WHERE id = calling_user_id;

    IF calling_user_email IS NULL THEN
        RAISE EXCEPTION 'Unable to resolve caller email';
    END IF;

    DELETE FROM login_attempts WHERE email = calling_user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant permissions (sensitive lockout functions are server-only)
REVOKE ALL ON FUNCTION check_login_lockout(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_failed_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_login_lockout(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_failed_login(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION clear_failed_login() TO authenticated;

-- Step 5: Clear all existing login attempts to start fresh
TRUNCATE TABLE login_attempts;

-- Done! Test message
SELECT 'Rate limiting fix applied successfully! All login attempts cleared. Ready to test.' AS status;
