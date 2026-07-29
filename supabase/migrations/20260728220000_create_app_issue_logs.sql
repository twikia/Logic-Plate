-- Internal issue telemetry. Not readable via the anon/authenticated API —
-- view rows in the Supabase Table Editor (service role / dashboard only).

CREATE TABLE IF NOT EXISTS public.app_issue_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source     TEXT        NOT NULL,
  kind       TEXT        NOT NULL,
  severity   TEXT        NOT NULL DEFAULT 'error'
               CHECK (severity IN ('info', 'warn', 'error')),
  message    TEXT        NOT NULL,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  cell_id    TEXT,
  user_id    UUID
);

CREATE INDEX IF NOT EXISTS idx_app_issue_logs_created_at
  ON public.app_issue_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_issue_logs_kind
  ON public.app_issue_logs (kind);

CREATE INDEX IF NOT EXISTS idx_app_issue_logs_source
  ON public.app_issue_logs (source);

ALTER TABLE public.app_issue_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_issue_logs FROM PUBLIC;
REVOKE ALL ON public.app_issue_logs FROM anon;
REVOKE ALL ON public.app_issue_logs FROM authenticated;

GRANT ALL ON public.app_issue_logs TO service_role;

COMMENT ON TABLE public.app_issue_logs IS
  'App/edge issue telemetry. No client SELECT — dashboard/service_role only.';
