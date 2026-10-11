-- ============================================
-- RPC Function: update_last_seen
-- ============================================
-- This function updates the last_seen timestamp for the current user
-- Called periodically to track online status securely

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    calling_user_id UUID;
    result JSON;
BEGIN

    calling_user_id := auth.uid();

    -- Security Check: Ensure user is authenticated
    IF calling_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Update last_seen for the current user
    UPDATE profiles
    SET last_seen = NOW()
    WHERE id = calling_user_id;


    result := json_build_object(
        'success', true,
        'last_seen', NOW()
    );

    RETURN result;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to update last_seen: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_last_seen() TO authenticated;

COMMENT ON FUNCTION update_last_seen IS 'Updates the last_seen timestamp for the current authenticated user';
