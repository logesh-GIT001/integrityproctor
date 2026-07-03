#!/bin/bash

# Kill any background processes spawned by this script on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "=========================================================="
echo "Starting IntegrityProctor Systems Suite..."
echo "=========================================================="

# Start backend
echo "[SYSTEM] Starting FastAPI Backend on http://localhost:8000..."
cd backend
source venv/bin/activate
PYTHONPATH=.. python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..

# Brief pause to let backend bind port
sleep 2

# Start frontend
echo "[SYSTEM] Starting Next.js Dev Server on http://localhost:3000..."
cd frontend
npm run dev -- -p 3000 &
cd ..

echo "=========================================================="
echo "✓ Services active!"
echo "  - Candidate Registration Portal: http://localhost:3000"
echo "  - HR Management Dashboard: http://localhost:3000/dashboard"
echo "  - Proctoring API Documentation: http://localhost:8000/docs"
echo "=========================================================="
echo "Press [Ctrl+C] to safely exit and shut down all nodes."

# Keep script running in foreground
wait
