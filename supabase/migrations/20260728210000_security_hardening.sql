-- Security hardening: tighten open RLS write policies, restrict group session
-- mutation surface, and enforce one vote per voter response.
-- Legacy cache tables are optional — only harden policies if the table exists.

-- ── Group sessions: create only via service_role (edge functions) ────────────
DROP POLICY IF EXISTS "Anyone can create a session" ON public.group_sessions;

CREATE POLICY "Service role can create sessions"
  ON public.group_sessions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Clients may only flip status; block tampering with host/picks/cells/etc.
CREATE OR REPLACE FUNCTION public.restrict_group_session_client_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.host_user_id IS DISTINCT FROM OLD.host_user_id
     OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW.cell_ids IS DISTINCT FROM OLD.cell_ids
     OR NEW.picks IS DISTINCT FROM OLD.picks
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Clients may only update group_sessions.status';
  END IF;

  IF OLD.status NOT IN ('collecting', 'voting') THEN
    RAISE EXCEPTION 'Session is no longer mutable';
  END IF;

  IF NEW.status NOT IN ('collecting', 'voting', 'complete', 'expired') THEN
    RAISE EXCEPTION 'Invalid group session status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_group_session_client_update ON public.group_sessions;
CREATE TRIGGER trg_restrict_group_session_client_update
  BEFORE UPDATE ON public.group_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_group_session_client_update();

-- ── Votes: require voter_response_id belonging to the session; one vote each ─
DROP POLICY IF EXISTS "Insert vote into active voting session" ON public.group_votes;

CREATE POLICY "Insert vote into active voting session"
  ON public.group_votes FOR INSERT
  WITH CHECK (
    voter_response_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.group_sessions gs
      WHERE gs.id = session_id
        AND gs.status = 'voting'
        AND gs.expires_at > now()
    )
    AND EXISTS (
      SELECT 1 FROM public.group_responses gr
      WHERE gr.id = voter_response_id
        AND gr.session_id = group_votes.session_id
    )
  );

DELETE FROM public.group_votes a
USING public.group_votes b
WHERE a.ctid < b.ctid
  AND a.session_id = b.session_id
  AND a.voter_response_id IS NOT NULL
  AND a.voter_response_id = b.voter_response_id;

CREATE UNIQUE INDEX IF NOT EXISTS group_votes_one_per_response
  ON public.group_votes (session_id, voter_response_id)
  WHERE voter_response_id IS NOT NULL;

-- ── Close public writes on legacy cache tables (only if present) ─────────────
DO $$
BEGIN
  IF to_regclass('public.restaurant_cache_res7') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Enable insert for all users" ON public.restaurant_cache_res7;
    DROP POLICY IF EXISTS "Enable update for all users" ON public.restaurant_cache_res7;
    DROP POLICY IF EXISTS "restaurant_cache_res7_service_write" ON public.restaurant_cache_res7;
    CREATE POLICY "restaurant_cache_res7_service_write"
      ON public.restaurant_cache_res7 FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF to_regclass('public.restaurant_cache_res6') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Enable insert for all users" ON public.restaurant_cache_res6;
    DROP POLICY IF EXISTS "Enable update for all users" ON public.restaurant_cache_res6;
    DROP POLICY IF EXISTS "restaurant_cache_res6_service_write" ON public.restaurant_cache_res6;
    CREATE POLICY "restaurant_cache_res6_service_write"
      ON public.restaurant_cache_res6 FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF to_regclass('public.restaurant_menu_cache') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Enable insert for all users" ON public.restaurant_menu_cache;
    DROP POLICY IF EXISTS "Enable update for all users" ON public.restaurant_menu_cache;
    DROP POLICY IF EXISTS "restaurant_menu_cache_service_write" ON public.restaurant_menu_cache;
    CREATE POLICY "restaurant_menu_cache_service_write"
      ON public.restaurant_menu_cache FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF to_regclass('public.v2_rejected_places') IS NOT NULL THEN
    DROP POLICY IF EXISTS "v2_rejected_places_public_insert" ON public.v2_rejected_places;
  END IF;

  IF to_regclass('public.foursquare_photo_cache') IS NOT NULL THEN
    DROP POLICY IF EXISTS "foursquare_photo_cache_delete" ON public.foursquare_photo_cache;
  END IF;
END $$;
