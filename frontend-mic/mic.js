let ws;
let mediaRecorder;

const log = (msg) => {
  document.getElementById("log").textContent += msg + "\n";
  console.log(msg);
};

document.getElementById("startBtn").onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log("🎤 Microfoon gestart...");

    // Open een WebSocket-verbinding
    ws = new WebSocket("wss://tory.chatystream.chat/ws");

    ws.onopen = () => {
      log("✅ WebSocket verbonden");
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
          log(`📦 Chunk verstuurd: ${event.data.size} bytes`);
        }
      });

      mediaRecorder.start(200); // elke 200ms een chunk
    };

    ws.onclose = () => log("❌ WebSocket gesloten");
    ws.onerror = (err) => log("⚠️ WebSocket fout: " + err.message);

    document.getElementById("startBtn").disabled = true;
    document.getElementById("stopBtn").disabled = false;
  } catch (err) {
    log("🚫 Fout bij microfoon: " + err.message);
  }
};

document.getElementById("stopBtn").onclick = () => {
  if (mediaRecorder) mediaRecorder.stop();
  if (ws) ws.close();
  log("🛑 Opname gestopt");
  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
};
