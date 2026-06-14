-- Allow all clients to read sessions regardless of status.
-- This enables realtime UPDATE events for expired sessions to reach subscribers
-- and allows clients to check session status (including 'expired') on load.
-- The old policy silently blocked realtime notifications when status changed to 'expired'.
drop policy if exists "Read non-expired sessions" on public.group_sessions;

create policy "Read all sessions"
  on public.group_sessions for select
  using (true);
