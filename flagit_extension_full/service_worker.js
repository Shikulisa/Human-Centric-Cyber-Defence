// service_worker.js - FULLY FIXED VERSION (correct email_timestamp forwarding)
const API_BASE = "http://127.0.0.1:5000";
const EXT_VERSION = "2.1.0";

const cache = new Map();

// IMPROVED: classifyText with detailed logging
async function classifyText(text, sender, emailTimestamp) {
  const key = `${EXT_VERSION}:${sender}:${text.slice(0, 300)}`;
  if (cache.has(key)) {
    console.log('🔹 Using cached classification');
    return cache.get(key);
  }

  console.log('🔹 SERVICE WORKER: Sending to backend API', {
    sender: sender,
    text_length: text.length,
    timestamp: emailTimestamp,
    preview: text.substring(0, 100)
  });

  try {
    const res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sender,
        email_timestamp: emailTimestamp
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log('🔹 SERVICE WORKER: Backend response:', data);
    
    cache.set(key, data);
    return data;
  } catch (e) {
    console.error("❌ SERVICE WORKER: Fetch error:", e);
    return { error: true, message: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  console.log('🔹 SERVICE WORKER: Received message:', msg.type);
  
  if (msg.type === "CLASSIFY") {
    classifyText(msg.text, msg.sender, msg.email_timestamp).then((r) => {
      console.log('🔹 SERVICE WORKER: Sending classification response:', r);
      sendResponse(r);
    });
    return true;
  }

  // ... rest of your message handling
});
async function sendFeedbackBatch(items, verdict) {
  let okCount = 0;

  for (const item of items) {
    const text =
      item.snippet ||
      item.subject ||
      item.text ||
      "";

    try {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          label: verdict,
          confidence: item.confidence ?? 0
        })
      });
      if (res.ok) okCount++;
    } catch (e) {
      console.error("Feedback error:", e);
    }
  }

  return { ok: true, count: okCount };
}
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "CLASSIFY") {
    console.log('🔹 SERVICE WORKER forwarding - timestamp:', msg.email_timestamp); // DEBUG
    classifyText(msg.text, msg.sender, msg.email_timestamp).then((r) =>
      sendResponse(r)
    );
    return true;
  }

  if (msg.type === "FEEDBACK_BATCH") {
    sendFeedbackBatch(msg.items || [], msg.verdict || "agreed").then((r) =>
      sendResponse(r)
    );
    return true;
  }

  return false;
});
