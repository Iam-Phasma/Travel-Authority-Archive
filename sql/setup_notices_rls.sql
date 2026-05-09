-- ============================================
-- RLS Policies for Notices Table
-- ============================================
-- Run this in your Supabase SQL Editor

-- Step 1: Enable RLS (if not already enabled)
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Step 2: Enable full replica identity so UPDATE events broadcast via realtime
ALTER TABLE notices REPLICA IDENTITY FULL;

-- ============================================
-- INSERT: Only super users can create notices
-- ============================================
DROP POLICY IF EXISTS "Super users can insert notices" ON notices;

CREATE POLICY "Super users can insert notices"
ON notices
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super'
    )
);

-- ============================================
-- SELECT: Users can read notices sent to them
-- ============================================

-- Regular users (role = 'user') see notices where receiver = 'users'
DROP POLICY IF EXISTS "Users can read their notices" ON notices;

CREATE POLICY "Users can read their notices"
ON notices
FOR SELECT
TO authenticated
USING (
    receiver IN ('users', 'both')
    AND is_active = true
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'user'
    )
);

-- Admins and super users see notices where receiver = 'admins'
DROP POLICY IF EXISTS "Admins can read their notices" ON notices;

CREATE POLICY "Admins can read their notices"
ON notices
FOR SELECT
TO authenticated
USING (
    receiver IN ('admins', 'both')
    AND is_active = true
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super')
    )
);

-- ============================================
-- UPDATE / DELETE: Only super users
-- ============================================
DROP POLICY IF EXISTS "Super users can manage notices" ON notices;

CREATE POLICY "Super users can manage notices"
ON notices
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'super'
    )
);

-- ============================================
-- VERIFY
-- ============================================
-- SELECT * FROM pg_policies WHERE tablename = 'notices';
