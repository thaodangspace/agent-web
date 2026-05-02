import { activeSession, activeSessionPath, sessions } from '$lib/stores/session.svelte.js';
import { rpcRunning } from '$lib/stores/rpc.svelte.js';
import { messages } from '$lib/stores/messages.svelte.js';
import { sidebarOpen } from '$lib/stores/ui.svelte.js';
import { fetchSession, fetchSessions } from '$lib/api/sessions.js';
import { stopRPC } from '$lib/api/rpc.js';
import { clearSeenEvents } from '$lib/utils/events.js';
import { ws } from '$lib/stores/ws.svelte.js';

export async function selectSession(id) {
  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    sidebarOpen.set(false);
  }

  // Stop previous RPC if switching sessions
  let currentRpc = false;
  rpcRunning.subscribe(v => { currentRpc = v; })();
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (currentRpc && currentActive && currentActive !== id) {
    try { await stopRPC(currentActive); } catch {}
  }

  activeSession.set(id);

  // Subscribe to the session via WS
  let socket = null;
  ws.subscribe(s => { socket = s; })();
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', session_id: id }));
  }

  // Fetch session info
  let sessionInfo = null;
  try {
    sessionInfo = await fetchSession(id);
    activeSessionPath.set(sessionInfo.file);
  } catch {}

  // Clear chat
  clearSeenEvents();
  messages.set([]);
}

export async function quitSession() {
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (!currentActive) return;
  if (!confirm('Quit this session? This will stop the RPC process.')) return;

  let currentRpc = false;
  rpcRunning.subscribe(v => { currentRpc = v; })();
  if (currentRpc) {
    try { await stopRPC(currentActive); } catch {}
  }

  activeSession.set(null);
  activeSessionPath.set(null);
  clearSeenEvents();
  messages.set([]);
}

export async function refreshSessions() {
  try {
    const list = await fetchSessions();
    sessions.set(list);
  } catch (e) {
    console.error('Failed to refresh sessions:', e);
  }
}
