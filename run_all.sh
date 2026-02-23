#!/bin/bash

echo "🚀 Starting HaydeBot Local Environment..."

# Function to run a command in a new macOS Terminal window
run_in_new_terminal() {
    local cmd=$1
    local title=$2
    osascript -e 'tell application "Terminal" to do script "cd \"'"$PWD"'\" && printf \"\\e]0;'"$title"'\\a\" && '"$cmd"'"'
}

# 1. Kill any existing processes holding our ports
echo "🧹 Cleaning up existing hung processes on ports 8000 and 3000..."
lsof -ti :8000 | xargs kill -9 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
killall -9 ngrok 2>/dev/null
sleep 2

# 2. Start the Backend (FastAPI / Uvicorn)
echo "🐍 Starting Python Backend (Port 8000)..."
run_in_new_terminal "uvicorn app.main:app --reload" "HaydeBot-Backend"

# 3. Start Ngrok
echo "🌐 Starting Ngrok Tunnel (Port 8000)..."
run_in_new_terminal "ngrok http 8000" "HaydeBot-Ngrok"

# 4. Start the Frontend (Next.js)
echo "⚛️ Starting Frontend Dashboard (Port 3000)..."
run_in_new_terminal "cd frontend && npm run dev" "HaydeBot-Frontend"

echo ""
echo "✅ All services started in separate terminal windows!"
echo ""
