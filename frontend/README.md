This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploying the IntegrityProctor System

This system is composed of a Next.js frontend and a FastAPI backend. For a fully production-ready, secure, and cost-free setup, we recommend deploying them as follows:

### 1. Deploy the Frontend on Vercel
You can host the frontend on Vercel's free hobby tier.

1. Import your git repository containing this project into Vercel.
2. Configure the project settings on Vercel:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
3. Add the following **Environment Variables** under Settings > Environment Variables:
   - `NEXT_PUBLIC_API_BASE_URL`: Set this to the public URL of your deployed backend (e.g., `https://proctor-backend.railway.app`).
4. Click **Deploy**.

---

### 2. Deploy the FastAPI Backend
You can host the Python FastAPI backend on platforms offering free tiers such as **Render**, **Railway**, or **Fly.io**.

#### Deployment Settings:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `DATABASE_URL`: Connection string to a database. (For free postgres, use **[Neon](https://neon.tech/)** or **[Supabase](https://supabase.com/)**). 
    *Note: If `DATABASE_URL` is omitted, the app will fallback to a local `sqlite:///./integrity_proctor.db` database. Use persistent disks if using SQLite on services like Render/Railway.*
  - `ANTHROPIC_API_KEY`: *(Optional)* Your Anthropic API Key to enable automated proctoring summaries powered by Claude-3.5-Sonnet. If not provided, a secure rule-based simulation engine will generate the reports automatically.

---

### 3. Local Development

To run the application locally:

#### Start the Backend
1. Create a virtual environment and install requirements:
   ```bash
   cd backend
   python -o venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Start the FastAPI server:
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

#### Start the Frontend
1. Install dependencies and start the Next.js dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Access the app at `http://localhost:3000`.

