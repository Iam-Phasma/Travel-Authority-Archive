-- Add control column to profiles table
-- Controls the permission level of admin users in the files (travel_authorities) table
-- Level 1: Can edit only
-- Level 2: Can edit and delete

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS control smallint NOT NULL DEFAULT 1
    CHECK (control IN (1, 2));

COMMENT ON COLUMN public.profiles.control IS
    'Admin permission level for travel_authorities table actions. 1 = edit only, 2 = edit + delete. Only relevant for role = ''admin''.';

-- Allow super users to update the control column via the RPC / direct update path
-- (Existing RLS policies that allow super users to update profiles already cover this,
--  but the comment below acts as a reminder if policies are ever audited.)
-- No new policy is required if the existing UPDATE policy on profiles
-- already permits super users to update all columns.
