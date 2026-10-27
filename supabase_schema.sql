-- ==============================================================================
-- STRIDE SQUAD / STRIDETRACK DATABASE SCHEMA FOR SUPABASE
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- ==============================================================================

-- 1. PROFILES TABLE (Holds every registered user and their public walking stats)
create table if not exists public.profiles (
  id text primary key, -- Auth user ID or client UUID
  username text unique not null,
  display_name text not null,
  avatar_color text default '#10b981',
  avatar_url text,
  daily_steps integer default 0,
  weekly_steps integer default 0,
  total_workouts integer default 0,
  is_walking_now boolean default false,
  current_activity text default 'walk',
  current_location jsonb, -- { latitude, longitude, heading }
  recent_trail jsonb, -- array of { latitude, longitude }
  location_private boolean default false,
  last_active text default 'Just now',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. FRIENDSHIPS TABLE (Two-way mutual friendship)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  friend_username text not null,
  custom_color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_friendship unique (user_id, friend_username)
);

-- 3. FRIEND REQUESTS TABLE (Incoming / Outgoing requests with statuses)
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id text not null,
  from_username text not null,
  from_display_name text not null,
  from_avatar_color text not null,
  to_username text not null,
  status text check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. SQUADS / GROUPS TABLE
create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  badge_emoji text,
  squad_type text default 'open_invite',
  created_by_id text not null,
  admin_ids jsonb default '[]'::jsonb,
  member_usernames jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. ENABLE ROW LEVEL SECURITY (RLS) & OPEN ACCESS POLICIES FOR INSTANT USAGE
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.squads enable row level security;

-- Permissive policies for Stride Squad (read & write with public anon key)
create policy "Public Profiles Read" on public.profiles for select using (true);
create policy "Public Profiles Insert" on public.profiles for insert with check (true);
create policy "Public Profiles Update" on public.profiles for update using (true);

create policy "Public Friendships Read" on public.friendships for select using (true);
create policy "Public Friendships Insert" on public.friendships for insert with check (true);
create policy "Public Friendships Delete" on public.friendships for delete using (true);
create policy "Public Friendships Update" on public.friendships for update using (true);

create policy "Public Requests Read" on public.friend_requests for select using (true);
create policy "Public Requests Insert" on public.friend_requests for insert with check (true);
create policy "Public Requests Update" on public.friend_requests for update using (true);
create policy "Public Requests Delete" on public.friend_requests for delete using (true);

create policy "Public Squads Read" on public.squads for select using (true);
create policy "Public Squads Insert" on public.squads for insert with check (true);
create policy "Public Squads Update" on public.squads for update using (true);
create policy "Public Squads Delete" on public.squads for delete using (true);

-- 6. ENABLE REALTIME ON PROFILES, REQUESTS, AND SQUADS
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.squads;
