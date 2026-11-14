# Cloud Hosting & Deployment Guide

This guide details how your app's data and backend services are configured to run completely off your computer on reliable cloud infrastructure with generous free tiers.

---

## Architecture Overview

1. **User Accounts, Social Squads, Steps & Real-Time Sync**:
   - **Provider**: **Supabase Cloud (PostgreSQL)**
   - **Cost**: **100% Free** up to 500MB database, 50,000 monthly active users, and unlimited API requests.
   - **Status**: Already configured in [`constants/supabaseClient.ts`](file:///c:/Users/toman/.gemini/antigravity-ide/scratch/stridetrack/constants/supabaseClient.ts).
   - All profile data, friend requests, squad leaderboards, and step activity sync to the cloud.

2. **Rep Analysis, Camera Battles & Challenges Backend**:
   - **Framework**: FastAPI (Python) + MediaPipe Pose AI
   - **Databases**: SQLite with persistent storage volume
   - **Target Hosts**: **Render** or **Railway** (both offer zero-cost initial tiers with persistent volumes).

---

## 1-Click Free Cloud Deployment Options

### Option A: Render (Recommended for Free Tier)
Render offers a free tier for web services and container builds:
1. Push your repository to **GitHub** or **GitLab**.
2. Log into [Render.com](https://render.com) (free signup).
3. Click **New +** -> **Blueprint**.
4. Connect this repository. Render will automatically detect [`render.yaml`](file:///c:/Users/toman/.gemini/antigravity-ide/scratch/stridetrack/render.yaml) and configure:
   - Docker container build with MediaPipe pose models preloaded.
   - Persistent volume at `/data` for `calories.sqlite3` and `country-quests.sqlite3`.
   - Health checks at `/rep-api/health`.
5. Once deployed, Render gives you a live public HTTPS URL (e.g. `https://stridetrack-backend.onrender.com`).
6. Copy the generated `REP_SERVER_TOKEN` from Render's Environment tab.

### Option B: Railway
1. Log into [Railway.app](https://railway.app).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Railway automatically detects [`railway.json`](file:///c:/Users/toman/.gemini/antigravity-ide/scratch/stridetrack/railway.json) and [`Dockerfile`](file:///c:/Users/toman/.gemini/antigravity-ide/scratch/stridetrack/Dockerfile).
4. In Settings -> **Volumes**, add a volume mounted to `/data`.
5. Add environment variable `REP_SERVER_TOKEN` (any secure 32+ character random string).
6. Under Settings -> **Networking**, click **Generate Domain**.

---

## Linking Your Mobile App to the Cloud Backend

In your mobile app root directory, create or edit your `.env` (or configure via Expo EAS Secrets):

```bash
EXPO_PUBLIC_REP_SERVER_URL=https://your-deployed-service.onrender.com/rep-api
EXPO_PUBLIC_REP_TOKEN=your-rep-server-token-here
```

Once set, the app will communicate directly with your cloud-hosted servers worldwide over encrypted HTTPS without requiring your computer to be turned on.
