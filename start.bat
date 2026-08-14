@echo off
REM TaskPilot -- one-command local startup (Windows)
REM Uses SQLite so there's zero database setup required.

cd /d "%~dp0backend"

if not exist venv (
  echo Creating Python virtual environment...
  python -m venv venv
)

call venv\Scripts\activate.bat

echo Installing backend dependencies (first run only, may take a minute)...
pip install -q -r requirements.txt

set DATABASE_URL=sqlite:///./taskpilot.db
set JWT_SECRET_KEY=dev-secret-change-if-you-deploy-this
set CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500

echo Starting backend at http://127.0.0.1:8000 ...
start "TaskPilot backend" cmd /k uvicorn app.main:app --port 8000

cd ..\frontend
echo Starting frontend at http://127.0.0.1:5500 ...
start "TaskPilot frontend" cmd /k python -m http.server 5500

timeout /t 2 /nobreak >nul
start http://127.0.0.1:5500

echo.
echo TaskPilot is running:
echo   App:      http://127.0.0.1:5500
echo   API docs: http://127.0.0.1:8000/docs
echo.
echo Two new windows opened for the backend and frontend servers.
echo Close those windows (or press Ctrl+C in each) to stop TaskPilot.
pause
