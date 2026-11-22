# Cloud Hosting & Deployment Guide

This guide details how your app's data and backend services are configured to run on cloud infrastructure.

---

## Architecture Overview

1. **User Accounts, Social Squads, Steps & Real-Time Sync**:
   - **Provider**: **Supabase Cloud (PostgreSQL + Auth)**
   - **Row Level Security**: All tables in [`supabase_schema.sql`](file:///c:/Users/toman/.gemini/antigravity-ide/scratch/stridetrack/supabase_schema.sql) enforce owner-scoped / friend-scoped RLS tied to `auth.uid()`. Live GPS coordinates live exclusively in `public.user_locations` and are only readable by mutual friends when `location_private = false`.

2. **Rep Analysis, Camera Battles & Challenges Backend**:
   - **Framework**: FastAPI (Python) + MediaPipe Pose AI
   - **Authentication**: Verifies each caller's Supabase user JWT (`Authorization: Bearer <access_token>`) using `SUPABASE_JWT_SECRET` or `SUPABASE_URL` (`/auth/v1/user`). Never ship a static `EXPO_PUBLIC_REP_TOKEN` in the mobile app.
   - **Databases**: SQLite with persistent storage volume at `/data`.
   - **Target Hosts**: **Render** or **Railway**.

---

## Backend Environment Variables (Render / Railway)

Set these on your deployed backend service (never in `.env` committed to git):

- `SUPABASE_URL`: Your Supabase project URL (`https://<ref>.supabase.co`)
- `SUPABASE_ANON_KEY`: Your Supabase anon/publishable key
- `SUPABASE_JWT_SECRET`: (Recommended) Your Supabase JWT secret for local HS256 verification
- `CALORIE_DB_PATH=/data/calories.sqlite3`
- `COUNTRY_QUEST_DB_PATH=/data/country-quests.sqlite3`
- `COMMUNITY_GOALS_DB_PATH=/data/community-goals.sqlite3`

Do **not** set `REP_ALLOW_DEV_TOKEN=1` in production.

---

## Linking Your Mobile App to the Cloud Backend

In your local untracked `.env` (or EAS Secrets), configure:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
EXPO_PUBLIC_REP_SERVER_URL=https://your-deployed-service.up.railway.app/rep-api
```

Signed-in users automatically authenticate with their per-user Supabase JWT over HTTPS.
