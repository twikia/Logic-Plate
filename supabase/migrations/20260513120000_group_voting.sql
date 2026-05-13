create table public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_user_id text,
  mode text,
  cell_ids text[],
  status text not null default 'collecting',
  picks jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index group_sessions_code_idx on public.group_sessions (code);
create index group_sessions_status_idx on public.group_sessions (status);

create table public.group_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_sessions (id) on delete cascade,
  voter_name text not null default 'Guest',
  energy_level text not null,
  food_mood text not null,
  priority text not null,
  dietary_vetoes text[] not null default '{}',
  submitted_at timestamptz not null default now()
);

create index group_responses_session_id_idx on public.group_responses (session_id);

create table public.group_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_sessions (id) on delete cascade,
  voter_response_id uuid references public.group_responses (id) on delete set null,
  place_id text not null,
  voted_at timestamptz not null default now()
);

create index group_votes_session_id_idx on public.group_votes (session_id);

alter table public.group_sessions enable row level security;

create policy "Read non-expired sessions"
  on public.group_sessions for select
  using (status <> 'expired');

create policy "Anyone can create a session"
  on public.group_sessions for insert
  with check (true);

create policy "Anyone can update group_sessions"
  on public.group_sessions for update
  using (true);

alter table public.group_responses enable row level security;

create policy "Insert response into active collecting session"
  on public.group_responses for insert
  with check (
    exists (
      select 1 from public.group_sessions gs
      where gs.id = session_id
        and gs.status = 'collecting'
        and gs.expires_at > now()
    )
  );

create policy "Read responses for any session"
  on public.group_responses for select
  using (true);

alter table public.group_votes enable row level security;

create policy "Insert vote into active voting session"
  on public.group_votes for insert
  with check (
    exists (
      select 1 from public.group_sessions gs
      where gs.id = session_id
        and gs.status = 'voting'
        and gs.expires_at > now()
    )
  );

create policy "Read votes for any session"
  on public.group_votes for select
  using (true);

alter publication supabase_realtime add table public.group_sessions;
alter publication supabase_realtime add table public.group_responses;
alter publication supabase_realtime add table public.group_votes;
