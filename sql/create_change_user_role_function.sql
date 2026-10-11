-- ============================================
-- RPC Function: change_user_role
-- ============================================
-- Allow only super users to change other users’ roles.
-- Validate the caller’s super role on the server before making changes.
--
-- Usage from JavaScript:
-- const { data, error } = await supabase.rpc('change_user_role', {
--   target_user_id: 'user-uuid-here',
--   new_role: 'admin'
-- });

-- Drop old function signature first
DROP FUNCTION IF EXISTS change_user_role(UUID, TEXT);

CREATE OR REPLACE FUNCTION change_user_role(
    target_user_id UUID,
    new_role TEXT,
    client_session_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calling_user_id UUID;
    calling_user_role TEXT;
    db_session_token TEXT;
    target_user_role TEXT;
    super_user_count INTEGER;
    result JSON;
BEGIN

    calling_user_id := auth.uid();

    -- Security Check 1: Ensure user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING HINT = 'You must be logged in to perform this action';
    END IF;

    -- Security Check 2: Get the calling user's role and session token from the database
    SELECT role, session_token INTO calling_user_role, db_session_token
    FROM profiles
    WHERE id = calling_user_id;

    -- Security Check 3: Only 'super' users can change roles
    IF calling_user_role != 'super' THEN
        RAISE EXCEPTION 'Permission denied'
            USING HINT = 'Only super users can change user roles';
    END IF;

    -- Security Check 4: Validate session token for admin/super users (single-session enforcement)
    IF calling_user_role IN ('admin', 'super') THEN
        IF client_session_token IS NULL OR db_session_token IS NULL OR client_session_token != db_session_token THEN
            RAISE EXCEPTION 'Session invalid'
                USING HINT = 'Your session has expired or another device logged in. Please log in again.';
        END IF;
    END IF;

    -- Validation: Ensure new_role is valid
    IF new_role NOT IN ('user', 'admin', 'super') THEN
        RAISE EXCEPTION 'Invalid role'
            USING HINT = 'Role must be one of: user, admin, super';
    END IF;

    -- Validation: Ensure target user exists
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found'
            USING HINT = 'The specified user does not exist';
    END IF;


    SELECT role INTO target_user_role
    FROM profiles
    WHERE id = target_user_id;

    -- Prevent the last enabled super user from removing their own super role.
    IF target_user_id = calling_user_id AND target_user_role = 'super' AND new_role != 'super' THEN
        -- Count total super users with access enabled
        SELECT COUNT(*) INTO super_user_count
        FROM profiles
        WHERE role = 'super' AND access_enabled = true;

        -- If this is the only super user, prevent the change
        IF super_user_count <= 1 THEN
            RAISE EXCEPTION 'Cannot change your role'
                USING HINT = 'You are the last super user. There must be at least one super user with access.';
        END IF;
    END IF;


    UPDATE profiles
    SET role = new_role
    WHERE id = target_user_id;


    result := json_build_object(
        'success', true,
        'message', 'Role updated successfully',
        'new_role', new_role
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise the error with operation details.
        RAISE EXCEPTION 'Failed to change user role: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
-- (The function itself will check if they're super users)
GRANT EXECUTE ON FUNCTION change_user_role(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION change_user_role IS 'Allows super users to change other users roles. Validates permissions server-side.';
