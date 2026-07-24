# Complete Production Deployment Guide: IntegrityProctor System

This guide outlines how to deploy both the Next.js frontend and FastAPI backend of the IntegrityProctor System to production using 100% free-tier services.

---

## Deployment Architecture

```
                      +---------------------------------------+
                      |         Vercel (Free Hobby Tier)      |
                      |  - Next.js Client Interface           |
                      |  - MediaPipe Vision / Web Audio WASM  |
                      +-------------------+-------------------+
                                          |
                                          | HTTPS API Requests & Audio Uploads
                                          v
                      +---------------------------------------+
                      |        Render (Free Web Service)      |
                      |  - FastAPI Backend                    |
                      |  - Unit Test Code Evaluator           |
                      +-------+-----------------------+-------+
                              |                       |
            SQL Connection    |                       | Storage HTTP REST
            (PostgreSQL)      v                       v (Upload snaps & audio)
     +----------------------------------+   +----------------------------------+
     |   Neon.tech (Free Postgres)      |   |   Supabase Bucket (Free Tier)    |
     |   - Candidate sessions           |   |   - Evidence Snapshots (images)  |
     |   - Question Bank & Test Cases   |   |   - Verifying Audio (.webm files)|
     |   - Proctor logs                 |   |                                  |
     +----------------------------------+   +----------------------------------+
```

---

## Step 1: Git Repository Preparation

To deploy to Vercel and Render, you must host your project on GitHub, GitLab, or Bitbucket.

1. **Initialize Git in your workspace** (if not already done):
   ```bash
   git init
   ```
2. **Create a `.gitignore`** in the root directory to prevent uploading local database files or credentials:
   ```
   # Node dependencies
   frontend/node_modules/
   frontend/.next/
   
   # Python environments
   backend/__pycache__/
   backend/.venv/
   
   # Local database
   backend/*.db
   ```
3. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: complete candidate secure invite and collapsible navigation features"
   ```
4. **Create a remote repository** on GitHub, and push your repository:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/integrity-proctor.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Database Provisioning (Neon.tech)

Render's free-tier web services have **ephemeral storage**. If you use a local SQLite database file, it will be wiped every time the backend redeploys or restarts. To persist questions and exam reports, we must link a hosted PostgreSQL database.

1. Navigate to [Neon.tech](https://neon.tech/) and sign up for a free account.
2. Click **Create New Project**.
3. Name your project (e.g., `integrity-proctor`) and select the Postgres version (default 16 or 17).
4. Select a cloud region closest to your target candidates (e.g., US East, Europe, or Asia Pacific).
5. Copy your **Connection URI String** from the dashboard. It will look like this:
   ```text
   postgresql://neondb_owner:xxxxxxxx@ep-xxxxxx-xxxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   *Keep this connection string safe for your backend environment configuration.*

---

## Step 3: Media & Audio Storage Bucket (Supabase)

To save candidate webcam evidence screenshots (taken during cheating flags) and audio recordings:

1. Sign up/log in to [Supabase](https://supabase.com/).
2. Create a new project (e.g. `integrity-proctor-storage`) and set a secure database password.
3. Once the project dashboard is ready, click **Storage** on the left sidebar.
4. Click **New Bucket** and configure:
   * **Bucket Name**: `proctor-uploads`
   * **Public Access**: Toggle **ON** (so the admin dashboard can fetch and load preview URLs of snapshots and audio).
5. Navigate to **Project Settings > API** and copy:
   * **Project URL**: `https://xxxxxxxxxxxxxx.supabase.co`
   * **API Key (Project API keys -> anon/public)**: A long JWT token.

---

## Step 4: Backend Service Deployment (Render)

Render hosts your python FastAPI environment and provides auto-scaling.

1. Go to [Render](https://render.com/) and register.
2. In the dashboard, click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `integrity-proctor` repository.
4. Set the following configuration parameters:
   * **Name**: `integrity-backend`
   * **Region**: Choose the same region you chose for Neon.tech.
   * **Branch**: `main`
   * **Root Directory**: `backend`
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r requirements.txt`
   * **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Click **Advanced** and add the following **Environment Variables**:

| Key | Value Description | Example |
|---|---|---|
| `DATABASE_URL` | Neon Connection String (Postgres URI) | `postgresql://neondb_owner:...` |
| `SUPABASE_URL` | Supabase Project URL | `https://xxxxxx.supabase.co` |
| `SUPABASE_KEY` | Supabase Anon/Public API Key JWT | `eyJhbGciOiJIUzI1NiIsInR...` |
| `GROQ_API_KEY` | Groq Cloud Key (Optional for AI reports) | `gsk_xxxxxx...` *(Falls back to heuristic model if empty)* |

6. Click **Create Web Service**. 
7. Once deployed, copy the Render public service URL (e.g., `https://integrity-backend.onrender.com`).

---

## Step 5: Frontend Hosting (Vercel)

Vercel provides optimized static and dynamic hosting for Next.js.

1. Sign up/log in to [Vercel](https://vercel.com/).
2. Click **Add New > Project** and select your GitHub repository.
3. Configure the following Project settings:
   * **Framework Preset**: Next.js
   * **Root Directory**: `frontend` (Vercel will ignore the backend folder)
4. Expand the **Environment Variables** section and insert:
   * **Key**: `NEXT_PUBLIC_API_BASE_URL`
   * **Value**: Your Render Backend URL copied in Step 4 (e.g. `https://integrity-backend.onrender.com`)
5. Click **Deploy**.
6. When compilation completes, Vercel will provide a public production URL (e.g., `https://integrity-proctor.vercel.app`).

---

## Verification & Cold-Start Behavior on Free Tiers

1. **Free-Tier Spin Up (Render Cold-Start)**: Render's free tier automatically goes to sleep after 15 minutes of inactivity. When a candidate opens the landing page, the initial system checks might say `RUNNING...` for 45–60 seconds while the backend is woken up. It is recommended to ping the URL to wake up the server before candidates enter.
2. **Client-Side MediaPipe Efficiency**: Because MediaPipe face landmarks are calculated locally in the candidate's browser via WebAssembly, the backend CPU remains practically idle. Render's free 512MB RAM tier is more than sufficient to serve unit testing and candidate logging requests.
3. **Resetting Sessions**: If you need to test candidate flows repeatedly, select the candidate in the HR Admin Dashboard and click **Reset Session**. This will immediately clear their records in Neon Postgres and allow their invite link to be reused.
