let ws;
// mediaRecorder kept for compatibility variable name but not used in PCM flow
let mediaRecorder;
let audioContext;
let sourceNode;
let processorNode;
let localStream;

const log = (msg) => {
  document.getElementById("log").textContent += msg + "\n";
  console.log(msg);
};

document.getElementById("startBtn").onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream = stream;
    log("🎤 Microfoon gestart...");

    // Open een WebSocket-verbinding (identical URL & behavior)
    ws = new WebSocket("wss://tory.chatystream.chat/ws");

    ws.onopen = () => {
      log("✅ WebSocket verbonden");

      // Create AudioContext and processing chain
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioContext.createMediaStreamSource(stream);

      const bufferSize = 4096; // approx. desired buffer size
      // create a processor with input channels equal to source channel count and 1 output channel
      processorNode = audioContext.createScriptProcessor(bufferSize, sourceNode.channelCount || 1, 1);

      // prevent audible feedback by routing through a zero-gain node
      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;

      processorNode.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const numChannels = inputBuffer.numberOfChannels;
        const len = inputBuffer.length;

        // Downmix to mono by averaging channels
        const mono = new Float32Array(len);
        for (let ch = 0; ch < numChannels; ch++) {
          const channelData = inputBuffer.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            mono[i] += channelData[i] / numChannels;
          }
        }

        // calculate RMS
        let sumSquares = 0;
        for (let i = 0; i < len; i++) {
          const s = mono[i];
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / len);

        // convert to 16-bit PCM (little-endian)
        const pcmBuffer = floatTo16BitPCM(mono);

        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(pcmBuffer);
            log(`📦 Chunk verstuurd: ${pcmBuffer.byteLength} bytes`);
            console.log(`PCM chunk: ${pcmBuffer.byteLength} bytes, RMS: ${rms}`);
          } catch (e) {
            console.error('Failed to send PCM chunk', e);
          }
        } else {
          console.log('WebSocket not open; skipping PCM chunk');
        }
      };

      // wire nodes: source -> processor -> zeroGain -> destination
      sourceNode.connect(processorNode);
      processorNode.connect(zeroGain);
      zeroGain.connect(audioContext.destination);
    };

    ws.onclose = () => log("❌ WebSocket gesloten");
    ws.onerror = (err) => log("⚠️ WebSocket fout: " + (err && err.message ? err.message : err));

    document.getElementById("startBtn").disabled = true;
    document.getElementById("stopBtn").disabled = false;
  } catch (err) {
    log("🚫 Fout bij microfoon: " + err.message);
  }
};

document.getElementById("stopBtn").onclick = () => {
  // Stop ScriptProcessor / AudioContext if present
  try {
    if (processorNode) {
      processorNode.disconnect();
      processorNode.onaudioprocess = null;
      processorNode = null;
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (e) { /* ignore */ }
      sourceNode = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    // stop all tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    if (ws) {
      try { ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }

    log("🛑 Opname gestopt");
  } catch (err) {
    console.error('Error during stop', err);
  }

  document.getElementById("startBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
};

// Helper: convert Float32Array [-1..1] to PCM16 ArrayBuffer (little-endian)
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    // scale to 16-bit signed int
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
