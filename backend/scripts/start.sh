#!/bin/bash

# Cross-Chain Dutch Auction Backend Startup Script

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$BACKEND_DIR/.env" ]; then
  echo "🔧 Loading environment variables from .env file"
  export $(grep -v '^#' "$BACKEND_DIR/.env" | xargs)
else
  echo "⚠️  No .env file found. Using default values."
  echo "   Consider copying .env.example to .env and configuring it."
fi

# Function to check if a port is in use
is_port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -i:"$1" >/dev/null 2>&1
    return $?
  else
    # Fallback to netstat if lsof is not available
    netstat -tuln | grep ":$1 " >/dev/null 2>&1
    return $?
  fi
}

# Function to start a service
start_service() {
  local service=$1
  local port=$2
  
  echo "🚀 Starting $service on port $port..."
  
  if is_port_in_use "$port"; then
    echo "❌ Port $port is already in use. Cannot start $service."
    return 1
  fi
  
  # Start the service
  cd "$BACKEND_DIR" && node index.js "$service" &
  local pid=$!
  
  # Store PID for later use
  echo $pid > "$BACKEND_DIR/.${service}.pid"
  echo "✅ $service started with PID $pid"
}

# Parse command line arguments
SERVICE="all"
if [ $# -gt 0 ]; then
  SERVICE=$1
fi

# Create logs directory if it doesn't exist
mkdir -p "$BACKEND_DIR/logs"

case "$SERVICE" in
  "all")
    echo "🌐 Starting all services..."
    cd "$BACKEND_DIR" && node index.js > "$BACKEND_DIR/logs/backend.log" 2>&1 &
    echo $! > "$BACKEND_DIR/.backend.pid"
    echo "✅ All services started with PID $!"
    echo "📝 Logs available at: $BACKEND_DIR/logs/backend.log"
    ;;
    
  "api")
    start_service "api" "${PORT:-3003}"
    echo "📝 Logs available at: $BACKEND_DIR/logs/api.log"
    ;;
    
  "relayer")
    start_service "relayer" "${RELAYER_PORT:-3001}"
    echo "📝 Logs available at: $BACKEND_DIR/logs/relayer.log"
    ;;
    
  "resolver")
    start_service "resolver" "${RESOLVER_PORT:-3002}"
    echo "📝 Logs available at: $BACKEND_DIR/logs/resolver.log"
    ;;
    
  "stop")
    echo "🛑 Stopping all services..."
    for pidfile in "$BACKEND_DIR"/.*.pid; do
      if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        service=$(basename "$pidfile" | sed 's/^\.//;s/\.pid$//')
        echo "🛑 Stopping $service (PID: $pid)..."
        kill -15 "$pid" 2>/dev/null || echo "⚠️  Process $pid not found"
        rm "$pidfile"
      fi
    done
    echo "✅ All services stopped"
    ;;
    
  "status")
    echo "📊 Service Status:"
    for pidfile in "$BACKEND_DIR"/.*.pid; do
      if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        service=$(basename "$pidfile" | sed 's/^\.//;s/\.pid$//')
        if ps -p "$pid" > /dev/null; then
          echo "✅ $service is running (PID: $pid)"
        else
          echo "❌ $service is not running (stale PID file)"
          rm "$pidfile"
        fi
      fi
    done
    
    # Check if no services are running
    if [ ! "$(ls -A "$BACKEND_DIR"/.*.pid 2>/dev/null)" ]; then
      echo "❌ No services are currently running"
    fi
    ;;
    
  *)
    echo "❌ Unknown service: $SERVICE"
    echo "Usage: $0 [all|api|relayer|resolver|stop|status]"
    exit 1
    ;;
esac

echo "🎉 Done!"
exit 0
