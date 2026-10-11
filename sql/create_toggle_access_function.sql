-- ============================================
-- RPC Function: toggle_user_access
-- ============================================
-- Allow only super users to enable or disable user access.
-- Validate the caller’s super role on the server before making changes.

-- Drop old function signature first
DROP FUNCTION IF EXISTS toggle_user_access(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION toggle_user_access(
    target_user_id UUID,
    new_access_enabled BOOLEAN,
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

    -- Security Check 3: Only 'super' users can toggle access
    IF calling_user_role != 'super' THEN
        RAISE EXCEPTION 'Permission denied'
            USING HINT = 'Only super users can enable/disable user access';
    END IF;

    -- Security Check 4: Validate session token for admin/super users (single-session enforcement)
    IF calling_user_role IN ('admin', 'super') THEN
        IF client_session_token IS NULL OR db_session_token IS NULL OR client_session_token != db_session_token THEN
            RAISE EXCEPTION 'Session invalid'
                USING HINT = 'Your session has expired or another device logged in. Please log in again.';
        END IF;
    END IF;


    SELECT role INTO target_user_role
    FROM profiles
    WHERE id = target_user_id;

    -- Prevent the last enabled super user from disabling their own access.
    IF target_user_id = calling_user_id AND new_access_enabled = false THEN
        -- If the user is a super user, check how many super users exist
        IF target_user_role = 'super' THEN
            -- Count total super users with access enabled
            SELECT COUNT(*) INTO super_user_count
            FROM profiles
            WHERE role = 'super' AND access_enabled = true;

            -- If this is the only super user, prevent the change
            IF super_user_count <= 1 THEN
                RAISE EXCEPTION 'Cannot disable your access'
                    USING HINT = 'You are the last super user. There must be at least one super user with access.';
            END IF;
        ELSE
            -- For non-super users, still prevent self-disable
            RAISE EXCEPTION 'Cannot disable your own access'
                USING HINT = 'You cannot disable access for your own account';
        END IF;
    END IF;

    -- Validation: Ensure target user exists
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_user_id) THEN
        RAISE EXCEPTION 'User not found'
            USING HINT = 'The specified user does not exist';
    END IF;


    UPDATE profiles
    SET access_enabled = new_access_enabled
    WHERE id = target_user_id;


    result := json_build_object(
        'success', true,
        'message', 'Access updated successfully',
        'access_enabled', new_access_enabled
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        -- Re-raise the error with operation details.
        RAISE EXCEPTION 'Failed to toggle user access: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
-- (The function itself will check if they're super users)
GRANT EXECUTE ON FUNCTION toggle_user_access(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION toggle_user_access IS 'Allows super users to enable/disable user access. Validates permissions server-side.';
