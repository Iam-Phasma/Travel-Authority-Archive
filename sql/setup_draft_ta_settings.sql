-- Run in the Supabase SQL editor before using the Draft TA PDF settings editor.
-- Uses the existing draft_ta columns and employee_list name foreign keys.
BEGIN;

-- Look up only the current user's permission without depending on profiles RLS.
-- Existing login logic treats NULL access_enabled as enabled; explicitly disabled
-- accounts are denied here too. No caller-supplied user ID or role is accepted.
CREATE OR REPLACE FUNCTION public.can_manage_draft_ta()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'super'
          AND access_enabled IS NOT FALSE
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_draft_ta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_draft_ta() TO authenticated;

ALTER TABLE public.draft_ta ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.draft_ta TO authenticated;
REVOKE ALL ON public.draft_ta FROM anon;
REVOKE DELETE ON public.draft_ta FROM authenticated;

-- Required when id is backed by a serial/identity sequence.
DO $$
DECLARE sequence_name text;
BEGIN
    sequence_name := pg_get_serial_sequence('public.draft_ta', 'id');
    IF sequence_name IS NOT NULL THEN
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
    END IF;
END $$;

DROP POLICY IF EXISTS draft_ta_read ON public.draft_ta;
CREATE POLICY draft_ta_read ON public.draft_ta
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS draft_ta_super_insert ON public.draft_ta;
CREATE POLICY draft_ta_super_insert ON public.draft_ta
FOR INSERT TO authenticated WITH CHECK (
    (SELECT public.can_manage_draft_ta())
);
DROP POLICY IF EXISTS draft_ta_super_update ON public.draft_ta;
CREATE POLICY draft_ta_super_update ON public.draft_ta
FOR UPDATE TO authenticated
USING ((SELECT public.can_manage_draft_ta()))
WITH CHECK ((SELECT public.can_manage_draft_ta()));

-- Restrictive guards also enforce the rule if this table already has broader policies.
DROP POLICY IF EXISTS draft_ta_insert_guard ON public.draft_ta;
CREATE POLICY draft_ta_insert_guard ON public.draft_ta AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (
    (SELECT public.can_manage_draft_ta())
);
DROP POLICY IF EXISTS draft_ta_update_guard ON public.draft_ta;
CREATE POLICY draft_ta_update_guard ON public.draft_ta AS RESTRICTIVE
FOR UPDATE TO authenticated
USING ((SELECT public.can_manage_draft_ta()))
WITH CHECK ((SELECT public.can_manage_draft_ta()));
DROP POLICY IF EXISTS draft_ta_delete_guard ON public.draft_ta;
CREATE POLICY draft_ta_delete_guard ON public.draft_ta AS RESTRICTIVE
FOR DELETE TO public USING (false);

COMMIT;
