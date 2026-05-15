export async function startRPC(sessionId) {
  const res = await fetch('/api/rpc/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopRPC(sessionId) {
  const res = await fetch('/api/rpc/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendRPC(sessionId, command) {
  const res = await fetch('/api/rpc/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, command }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRPCStatus() {
  const res = await fetch('/api/rpc/status');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRPCState(sessionId) {
  const res = await fetch('/api/rpc/get_state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getRPCCOmmands(sessionId) {
  const res = await fetch('/api/rpc/get_commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getAvailableModels(sessionId) {
  const res = await fetch('/api/rpc/get_models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function setModel(sessionId, provider, modelId) {
  const res = await fetch('/api/rpc/set_model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, provider, model_id: modelId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cycleModel(sessionId) {
  const res = await fetch('/api/rpc/cycle_model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadImage(file) {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch('/api/images/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Build a URL to view an image served from ~/.pi/images/ via the backend. */
export function imageViewUrl(absPath) {
  const encoded = btoa(absPath)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `/api/images/view?p=${encoded}`;
}

/** Translate text using the server's local LLM (LM Studio). */
export async function translateText(text, targetLang = 'vi') {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Convert a standard base64 string to a base64url-encoded string
 * (replaces + with -, / with _, strips trailing =).
 */
function btoa(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
