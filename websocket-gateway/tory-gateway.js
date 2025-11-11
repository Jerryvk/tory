import express from "express";
import expressWs from "express-ws";
import dotenv from "dotenv";

// Load environment variables (optional for future integrations)
dotenv.config({ path: "/var/www/chatystream/environments/.env" });

const app = express();
const { app: wsApp } = expressWs(app);

const PORT = 8081;

// --- Logging helpers ---
function nowTs() {
  return new Date().toISOString();
}

function logEvent(event, detail = {}) {
  console.log(JSON.stringify({ ts: nowTs(), event, detail }));
}

// --- WebSocket setup ---
let connCounter = 0;
logEvent("tory.gateway.start", { port: PORT });

// Each browser client connects here
wsApp.ws("/ws", (client, req) => {
  const connId = ++connCounter;
  logEvent("client.connected", { connId });

  let lastClientActivity = Date.now();
  const hbInterval = 10000; // ping every 10s
  const inactiveLimit = 30000; // close after 30s idle

  // When browser sends audio chunks
  client.on("message", (msg, isBinary) => {
    lastClientActivity = Date.now();
    const size = Buffer.isBuffer(msg) ? msg.length : Buffer.byteLength(msg);
    logEvent("client.message", { connId, bytes: size, isBinary });

    // Future: route audio to Whisper/OpenAI here

    // Echo back acknowledgment
    client.send(JSON.stringify({
      type: "ack",
      ts: nowTs(),
      info: `Received ${size} bytes from client ${connId}`
    }));
  });

  client.on("close", () => {
    logEvent("client.closed", { connId });
    clearInterval(heartbeat);
  });

  client.on("error", (err) => {
    logEvent("client.error", { connId, message: err.message });
    try { client.terminate(); } catch {}
    clearInterval(heartbeat);
  });

  // --- Heartbeat ---
  const heartbeat = setInterval(() => {
    const now = Date.now();
    try {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "ping", ts: now }));
      }
    } catch (e) {
      logEvent("heartbeat.error", { connId, message: e.message });
    }

    if (now - lastClientActivity > inactiveLimit) {
      logEvent("heartbeat.timeout", { connId });
      try { client.close(); } catch {}
      clearInterval(heartbeat);
    }
  }, hbInterval);
});

app.listen(PORT, () => {
  console.log(`✅ Tory WebSocket Gateway active on port ${PORT}`);
});
