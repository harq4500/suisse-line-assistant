#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "  🚀 Starting Atelier Coiffure Zürich AI Service"
echo "=================================================="

# 1. Kill any existing instances of server or tunnel
pkill -f "node server.js" 2>/dev/null || true
pkill -f "a.pinggy.io" 2>/dev/null || true

# 2. Start the Express Salon Backend
echo "[1/4] Starting Express Backend (Port 3000)..."
node server.js > server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Verify server is listening
if ! curl -s http://localhost:3000/health > /dev/null; then
  echo "❌ Error: Express server failed to start. Check server.log"
  exit 1
fi
echo "✓ Backend online on http://localhost:3000"

# 3. Start Public HTTPS Tunnel (Pinggy)
echo "[2/4] Establishing secure public HTTPS tunnel..."
rm -f pinggy.log
ssh -p 443 -R0:localhost:3000 -o StrictHostKeyChecking=no -o ServerAliveInterval=10 -o ServerAliveCountMax=999 a.pinggy.io > pinggy.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL
PUBLIC_URL=""
for i in {1..30}; do
  sleep 1
  if [ -f pinggy.log ]; then
    URL_CANDIDATE=$(grep -oE 'https://[a-zA-Z0-9.-]+\.free\.pinggy\.net' pinggy.log | head -n 1 || true)
    if [ -n "$URL_CANDIDATE" ]; then
      PUBLIC_URL="$URL_CANDIDATE"
      break
    fi
  fi
done

if [ -z "$PUBLIC_URL" ]; then
  echo "❌ Error: Could not establish tunnel within 30 seconds. Check pinggy.log"
  exit 1
fi

echo "✓ Public HTTPS URL established: $PUBLIC_URL"

# Load environment variables from .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# 4. Programmatically Update & Deploy Suisse Line Agent
echo "[3/4] Updating & deploying Suisse Line Agent (ID: ${SUISSE_LINE_AGENT_ID:-1554})..."
PUBLIC_URL="$PUBLIC_URL" SUISSE_LINE_API_KEY="$SUISSE_LINE_API_KEY" SUISSE_LINE_AGENT_ID="$SUISSE_LINE_AGENT_ID" node - <<'EOF'
const https = require('https');

const agentId = process.env.SUISSE_LINE_AGENT_ID || 1554;
const apiKey = process.env.SUISSE_LINE_API_KEY;

if (!apiKey) {
  console.error("❌ Error: SUISSE_LINE_API_KEY is missing. Please set it in .env");
  process.exit(1);
}
const publicUrl = process.env.PUBLIC_URL;

const payload = JSON.stringify({
  tools: [
    {
      name: "checkAvailability",
      description: "Prüft verfügbare freie Termine für einen bestimmten Tag und Service im Salon-Kalender.",
      endpoint: `${publicUrl}/api/check-availability`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      parameters: [
        { name: "date", type: "string", required: true, description: "Datum im Format JJJJ-MM-TT (z.B. 2026-11-10)" },
        { name: "service", type: "string", required: false, description: "Art der Dienstleistung (z.B. Herrenhaarschnitt, Damenhaarschnitt)" }
      ]
    },
    {
      name: "bookAppointment",
      description: "Bucht einen festen Termin im Kalender und versendet automatisch eine Bestätigungs-SMS mit einem 1-Klick Calendly Reschedule-Link an den Kunden.",
      endpoint: `${publicUrl}/api/book-appointment`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      parameters: [
        { name: "customer_name", type: "string", required: true, description: "Vollständiger Vor- und Nachname des Kunden" },
        { name: "phone_number", type: "string", required: true, description: "Mobiltelefonnummer des Kunden für SMS (z.B. +41 79 123 45 67)" },
        { name: "datetime", type: "string", required: true, description: "Datum und Uhrzeit des Termins (z.B. 2026-11-10 14:00)" },
        { name: "service", type: "string", required: true, description: "Gewählte Dienstleistung (z.B. Herrenhaarschnitt, Damenhaarschnitt)" }
      ]
    }
  ],
  webhooks: [
    {
      url: `${publicUrl}/api/webhook/call-events`,
      events: ["call.completed", "call.ended", "transcript.ready"],
      headers: { "Content-Type": "application/json" },
      enabled: true
    }
  ]
});

// Patch Agent
const patchReq = https.request(`https://app.suisse-line.ch/api/phone-agent/${agentId}`, {
  method: 'PATCH',
  headers: {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    // Deploy Agent
    const deployReq = https.request(`https://app.suisse-line.ch/api/phone-agent/${agentId}/deploy`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': 2
      }
    }, (dRes) => {
      dRes.on('data', () => {});
      dRes.on('end', () => {
        console.log("✓ Agent updated and deployed successfully to Suisse Line!");
      });
    });
    deployReq.write('{}');
    deployReq.end();
  });
});

patchReq.on('error', (e) => {
  console.error("❌ Failed to update Suisse Line agent:", e);
});
patchReq.write(payload);
patchReq.end();
EOF

sleep 3

# 5. Summary Output
echo ""
echo "=================================================="
echo "  🎉 ALL SERVICES ARE LIVE & CONNECTED!"
echo "=================================================="
echo "  1. Live Web Dashboard & Voice Widget:"
echo "     👉 $PUBLIC_URL/"
echo ""
echo "  2. Sample 1-Click Reschedule Page:"
echo "     👉 $PUBLIC_URL/reschedule?booking_id=ACZ-3278"
echo ""
echo "  3. Suisse Line Agent 1554:"
echo "     👉 Deployed & configured with tools pointing to $PUBLIC_URL"
echo "=================================================="
echo "  Press Ctrl+C to stop services."

# Keep alive loop
trap 'echo "Stopping services..."; kill $SERVER_PID $TUNNEL_PID 2>/dev/null || true; exit 0' INT TERM

while true; do
  curl -s http://localhost:3000/health > /dev/null
  sleep 10
done
