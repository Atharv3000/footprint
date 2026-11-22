-- ==============================================================================
-- FOOTPRINT DATABASE SCHEMA & HARDENED RLS POLICIES FOR SUPABASE
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. PROFILES TABLE (Non-location public/social stats; tied strictly to auth.uid())
create table if not exists public.profiles (
  id text primary key, -- Must match auth.uid()::text
  username text unique not null check (char_length(username) between 3 and 20 and username ~ '^[a-z0-9_]+$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_color text default '#10b981',
  avatar_url text,
  daily_steps integer default 0 check (daily_steps >= 0 and daily_steps <= 500000),
  weekly_steps integer default 0 check (weekly_steps >= 0 and weekly_steps <= 3500000),
  total_workouts integer default 0 check (total_workouts >= 0 and total_workouts <= 100000),
  is_walking_now boolean default false,
  current_activity text default 'walk' check (current_activity in ('walk', 'run', 'cycle')),
  location_private boolean default true,
  last_active text default 'Just now',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Scrub legacy location columns from public.profiles if upgrading an existing project
alter table public.profiles drop column if exists current_location;
alter table public.profiles drop column if exists recent_trail;

-- 1b. USER LOCATIONS TABLE (Strictly isolated live GPS coordinates & trails)
create table if not exists public.user_locations (
  user_id text primary key references public.profiles(id) on delete cascade,
  current_location jsonb, -- { latitude, longitude, heading }
  recent_trail jsonb, -- array of { latitude, longitude }
  location_private boolean not null default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. FRIENDSHIPS TABLE (Two-way mutual friendship)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  friend_id text,
  friend_username text not null,
  custom_color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_friendship unique (user_id, friend_username)
);

alter table public.friendships add column if not exists friend_id text;

-- 3. FRIEND REQUESTS TABLE (Incoming / Outgoing requests with statuses)
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id text not null,
  from_username text not null,
  from_display_name text not null,
  from_avatar_color text not null,
  to_user_id text,
  to_username text not null,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint no_self_friend_request check (lower(from_username) <> lower(to_username))
);

alter table public.friend_requests add column if not exists to_user_id text;

create unique index if not exists unique_pending_friend_request
  on public.friend_requests (lower(from_username), lower(to_username))
  where status = 'pending';

-- 4. SQUADS / GROUPS TABLE
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text default '' check (char_length(description) <= 240),
  badge_emoji text,
  squad_type text default 'open_invite' check (squad_type in ('admin_only', 'open_invite')),
  created_by_id text not null,
  admin_ids jsonb default '[]'::jsonb,
  member_usernames jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. ENABLE ROW LEVEL SECURITY (RLS) & DROP ALL LEGACY PERMISSIVE POLICIES
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.squads enable row level security;

drop policy if exists "Public Profiles Read" on public.profiles;
drop policy if exists "Public Profiles Insert" on public.profiles;
drop policy if exists "Public Profiles Update" on public.profiles;
drop policy if exists "Authenticated Profiles Read" on public.profiles;
drop policy if exists "Own Profile Insert" on public.profiles;
drop policy if exists "Own Profile Update" on public.profiles;
drop policy if exists "Own Profile Delete" on public.profiles;

drop policy if exists "Friends Or Self Location Read" on public.user_locations;
drop policy if exists "Own Location Insert" on public.user_locations;
drop policy if exists "Own Location Update" on public.user_locations;
drop policy if exists "Own Location Delete" on public.user_locations;

drop policy if exists "Public Friendships Read" on public.friendships;
drop policy if exists "Public Friendships Insert" on public.friendships;
drop policy if exists "Public Friendships Delete" on public.friendships;
drop policy if exists "Public Friendships Update" on public.friendships;
drop policy if exists "Own Friendships Read" on public.friendships;
drop policy if exists "Own Friendships Insert" on public.friendships;
drop policy if exists "Own Friendships Update" on public.friendships;
drop policy if exists "Own Friendships Delete" on public.friendships;

drop policy if exists "Public Requests Read" on public.friend_requests;
drop policy if exists "Public Requests Insert" on public.friend_requests;
drop policy if exists "Public Requests Update" on public.friend_requests;
drop policy if exists "Public Requests Delete" on public.friend_requests;
drop policy if exists "Involved Friend Requests Read" on public.friend_requests;
drop policy if exists "Sender Friend Requests Insert" on public.friend_requests;
drop policy if exists "Recipient Friend Requests Update" on public.friend_requests;
drop policy if exists "Involved Friend Requests Delete" on public.friend_requests;

drop policy if exists "Public Squads Read" on public.squads;
drop policy if exists "Public Squads Insert" on public.squads;
drop policy if exists "Public Squads Update" on public.squads;
drop policy if exists "Public Squads Delete" on public.squads;
drop policy if exists "Member Squads Read" on public.squads;
drop policy if exists "Creator Squads Insert" on public.squads;
drop policy if exists "Admin Squads Update" on public.squads;
drop policy if exists "Creator Squads Delete" on public.squads;

-- 6. STRICT OWNER-SCOPED & FRIEND-SCOPED POLICIES

-- Profiles: authenticated users can look up non-location profile metadata; only the owner can write/delete their row.
create policy "Authenticated Profiles Read"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Own Profile Insert"
  on public.profiles for insert
  with check (auth.uid()::text = id);

create policy "Own Profile Update"
  on public.profiles for update
  using (auth.uid()::text = id)
  with check (auth.uid()::text = id);

create policy "Own Profile Delete"
  on public.profiles for delete
  using (auth.uid()::text = id);

-- User Locations: strictly readable ONLY by owner or mutual accepted friends when location_private = false.
create policy "Friends Or Self Location Read"
  on public.user_locations for select
  using (
    auth.uid()::text = user_id
    or (
      location_private = false
      and exists (
        select 1 from public.friendships f
        where f.user_id = public.user_locations.user_id
          and f.friend_id = auth.uid()::text
      )
      and exists (
        select 1 from public.friendships f2
        where f2.user_id = auth.uid()::text
          and f2.friend_id = public.user_locations.user_id
      )
    )
  );

create policy "Own Location Insert"
  on public.user_locations for insert
  with check (
    auth.uid()::text = user_id
    and (
      location_private = false
      or (current_location is null and recent_trail is null)
    )
  );

create policy "Own Location Update"
  on public.user_locations for update
  using (auth.uid()::text = user_id)
  with check (
    auth.uid()::text = user_id
    and (
      location_private = false
      or (current_location is null and recent_trail is null)
    )
  );

create policy "Own Location Delete"
  on public.user_locations for delete
  using (auth.uid()::text = user_id);

-- Friendships: users only see and manage their own friendships.
create policy "Own Friendships Read"
  on public.friendships for select
  using (auth.uid()::text = user_id or auth.uid()::text = friend_id);

create policy "Own Friendships Insert"
  on public.friendships for insert
  with check (auth.uid()::text = user_id);

create policy "Own Friendships Update"
  on public.friendships for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Own Friendships Delete"
  on public.friendships for delete
  using (auth.uid()::text = user_id or auth.uid()::text = friend_id);

-- Friend Requests: only sender or recipient can view/act; sender identity is verified against their profile.
create policy "Involved Friend Requests Read"
  on public.friend_requests for select
  using (
    auth.uid()::text = from_user_id
    or auth.uid()::text = to_user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and lower(p.username) = lower(public.friend_requests.to_username)
    )
  );

create policy "Sender Friend Requests Insert"
  on public.friend_requests for insert
  with check (
    auth.uid()::text = from_user_id
    and status = 'pending'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and lower(p.username) = lower(public.friend_requests.from_username)
    )
  );

create policy "Recipient Friend Requests Update"
  on public.friend_requests for update
  using (
    auth.uid()::text = to_user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and lower(p.username) = lower(public.friend_requests.to_username)
    )
  )
  with check (status in ('accepted', 'declined'));

create policy "Involved Friend Requests Delete"
  on public.friend_requests for delete
  using (
    auth.uid()::text = from_user_id
    or auth.uid()::text = to_user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and lower(p.username) = lower(public.friend_requests.to_username)
    )
  );

-- Squads: visible and mutable only by members / admins / creator.
create policy "Member Squads Read"
  on public.squads for select
  using (
    auth.uid()::text = created_by_id
    or admin_ids ? auth.uid()::text
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()::text
        and member_usernames ? p.username
    )
  );

create policy "Creator Squads Insert"
  on public.squads for insert
  with check (auth.uid()::text = created_by_id);

create policy "Admin Squads Update"
  on public.squads for update
  using (
    auth.uid()::text = created_by_id
    or admin_ids ? auth.uid()::text
  )
  with check (
    auth.uid()::text = created_by_id
    or admin_ids ? auth.uid()::text
  );

create policy "Creator Squads Delete"
  on public.squads for delete
  using (auth.uid()::text = created_by_id);

-- 7. ATOMIC RPCs FOR MUTUAL FRIENDSHIP OPERATIONS (PREVENT CROSS-USER IMPERSONATION)
create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_my_username text;
  v_req public.friend_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select username into v_my_username from public.profiles where id = v_uid;
  if v_my_username is null then
    raise exception 'Profile not found';
  end if;

  select * into v_req from public.friend_requests where id = p_request_id for update;
  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_req.to_user_id is distinct from v_uid and lower(v_req.to_username) <> lower(v_my_username) then
    raise exception 'Not authorized to accept this request';
  end if;

  update public.friend_requests
  set status = 'accepted', to_user_id = v_uid
  where id = p_request_id;

  insert into public.friendships (user_id, friend_id, friend_username)
  values (v_uid, v_req.from_user_id, lower(v_req.from_username))
  on conflict (user_id, friend_username) do update set friend_id = excluded.friend_id;

  insert into public.friendships (user_id, friend_id, friend_username)
  values (v_req.from_user_id, v_uid, lower(v_my_username))
  on conflict (user_id, friend_username) do update set friend_id = excluded.friend_id;
end;
$$;

create or replace function public.remove_friendship(p_friend_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_my_username text;
  v_friend_id text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select username into v_my_username from public.profiles where id = v_uid;
  select id into v_friend_id from public.profiles where lower(username) = lower(p_friend_username);

  delete from public.friendships
  where user_id = v_uid and lower(friend_username) = lower(p_friend_username);

  if v_friend_id is not null and v_my_username is not null then
    delete from public.friendships
    where user_id = v_friend_id and lower(friend_username) = lower(v_my_username);
  end if;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
grant execute on function public.accept_friend_request(uuid) to authenticated;

revoke all on function public.remove_friendship(text) from public;
grant execute on function public.remove_friendship(text) to authenticated;

-- 8. ENABLE REALTIME SAFELY ON TABLES
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_locations'
  ) then
    alter publication supabase_realtime add table public.user_locations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squads'
  ) then
    alter publication supabase_realtime add table public.squads;
  end if;
end $$;
