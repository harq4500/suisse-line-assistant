#!/bin/bash
# Keepalive supervisor for Pinggy tunnel

while true; do
  # Check if pinggy process is still alive
  if ! pgrep -f "a.pinggy.io" > /dev/null; then
    echo "[$(date)] Pinggy disconnected. Reconnecting..." >> /var/projects/job/tunnel.log
    ssh -p 443 -R0:localhost:3000 -o StrictHostKeyChecking=no -o ServerAliveInterval=10 -o ServerAliveCountMax=999 a.pinggy.io >> /var/projects/job/tunnel.log 2>&1 &
  fi
  # Keep server active
  curl -s http://localhost:3000/health > /dev/null
  sleep 10
done
