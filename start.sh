#!/usr/bin/env bash
# TaskPilot — one-command local startup (Mac/Linux)
# Uses SQLite so there's zero database setup required.
set -e

cd "$(dirname "$0")/backend"

if [ ! -d "venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
echo "Installing backend dependencies (first run only, may take a minute)..."
pip install -q -r requirements.txt

export DATABASE_URL="sqlite:///./taskpilot.db"
export JWT_SECRET_KEY="dev-secret-change-if-you-deploy-this"
export CORS_ORIGINS="http://127.0.0.1:5500,http://localhost:5500"

# Pick up an Anthropic key if the user has set one in backend/.env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | grep ANTHROPIC_API_KEY | xargs -0 2>/dev/null || true)
fi

echo "Starting backend at http://127.0.0.1:8000 ..."
uvicorn app.main:app --port 8000 &
BACKEND_PID=$!

cd ../frontend
echo "Starting frontend at http://127.0.0.1:5500 ..."
python3 -m http.server 5500 &
FRONTEND_PID=$!

sleep 2
echo ""
echo "TaskPilot is running:"
echo "  App:      http://127.0.0.1:5500"
echo "  API docs: http://127.0.0.1:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Open the browser automatically if possible
( sleep 1 && (open http://127.0.0.1:5500 2>/dev/null || xdg-open http://127.0.0.1:5500 2>/dev/null || true) ) &

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
