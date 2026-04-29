-- ============================================
-- RPC Function: get_all_users_with_emails
-- ============================================
-- This function retrieves all users with their emails from auth.users
-- and combines them with their roles from the profiles table.
-- Only accessible by super users.
--
-- WHY THIS IS NEEDED:
-- - Emails are stored in auth.users (Supabase's authentication table)
-- - Roles are stored in profiles (your custom table)
-- - We need to join them together to display user emails with their roles
-- - Client-side code cannot access auth.users directly for security reasons

-- Drop old function signature first
DROP FUNCTION IF EXISTS get_all_users_with_emails();
DROP FUNCTION IF EXISTS get_all_users_with_emails(TEXT);

CREATE OR REPLACE FUNCTION get_all_users_with_emails(
    client_session_token TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    email TEXT,
    role TEXT,
    access_enabled BOOLEAN,
    is_online BOOLEAN,
    last_seen TIMESTAMPTZ,
    control SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to access auth.users
AS $$
DECLARE
    calling_user_role TEXT;
    db_session_token TEXT;
BEGIN
    -- Security Check 1: Only super users can view all users
    SELECT p.role, p.session_token INTO calling_user_role, db_session_token
    FROM profiles p
    WHERE p.id = auth.uid();
    
    IF calling_user_role != 'super' THEN
        RAISE EXCEPTION 'Permission denied: Only super users can view all users';
    END IF;
    
    -- Security Check 2: Validate session token for admin/super users (single-session enforcement)
    IF calling_user_role IN ('admin', 'super') THEN
        IF client_session_token IS NULL OR db_session_token IS NULL OR client_session_token != db_session_token THEN
            RAISE EXCEPTION 'Session invalid: Your session has expired or another device logged in. Please log in again.';
        END IF;
    END IF;
    
    -- Return all users with their emails, roles, and online status
    -- A user is considered online if they were active in the last 5 minutes
    -- Joins auth.users (for email) with profiles (for role, access_enabled, and last_seen)
    RETURN QUERY
    SELECT 
        au.id::UUID,
        au.email::TEXT,
        COALESCE(p.role, 'user')::TEXT as role,
        COALESCE(p.access_enabled, true)::BOOLEAN as access_enabled,
        (p.last_seen IS NOT NULL AND p.last_seen > NOW() - INTERVAL '5 minutes')::BOOLEAN as is_online,
        p.last_seen::TIMESTAMPTZ,
        COALESCE(p.control, 1::SMALLINT)::SMALLINT as control
    FROM auth.users au
    LEFT JOIN profiles p ON p.id = au.id
    ORDER BY au.email;
    
END;
$$;

-- Grant execute permission to authenticated users
-- (The function itself checks if they're super users)
GRANT EXECUTE ON FUNCTION get_all_users_with_emails(TEXT) TO authenticated;

COMMENT ON FUNCTION get_all_users_with_emails IS 'Returns all users with emails from auth.users and roles from profiles. Only accessible by super users.';
