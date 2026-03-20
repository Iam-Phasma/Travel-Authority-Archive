-- ================================================
-- Harden login lockout functions for Edge Function usage
-- Run this after create_rate_limiting.sql and add_login_ip_rate_limiting.sql
-- ================================================

-- Step 1: Add a server-side helper to clear login attempts by email.
CREATE OR REPLACE FUNCTION clear_failed_login_for_email(user_email TEXT)
RETURNS VOID AS $$
DECLARE
    normalized_email TEXT := lower(trim(user_email));
BEGIN
    IF normalized_email IS NULL OR normalized_email = '' THEN
        RETURN;
    END IF;

    DELETE FROM login_attempts
    WHERE email = normalized_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Restrict sensitive lockout functions to service_role only.
REVOKE ALL ON FUNCTION check_login_lockout(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_failed_login(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clear_failed_login_for_email(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION check_login_lockout(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION record_failed_login(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION clear_failed_login_for_email(TEXT) TO service_role;

SELECT 'Login lockout functions hardened for Edge Function usage.' AS status;
