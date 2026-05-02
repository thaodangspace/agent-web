// ===== Session Module =====
import {
  activeSession, activeSessionPath, rpcRunning,
  setActiveSession, setActiveSessionPath, setRpcRunning,
  chatMessages, rpcToggleBtn
} from './state.js';
import { updateRPCUI } from './ui.js';
import { addSystemMessage, clearSeenEvents } from './chat.js';

export async function quitSession() {
  if (!activeSession) return;

  const ok = confirm('Quit this session? This will stop the RPC process.');
  if (!ok) return;

  try {
    await fetch('/api/rpc/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSession }),
    });
  } catch (e) {
    console.error('Quit session error:', e);
  }

  setRpcRunning(false);
  setActiveSession(null);
  setActiveSessionPath(null);
  clearSeenEvents();
  chatMessages.innerHTML = '';
  const es = document.createElement('div');
  es.id = 'emptyState';
  es.className = 'flex items-center justify-center h-full text-ctp-overlay0 text-sm';
  es.textContent = 'Select a session and start RPC to begin chatting';
  chatMessages.appendChild(es);
  document.getElementById('headerInfo').innerHTML = '';
  const modelBadge = document.getElementById('modelBadge');
  modelBadge.textContent = '';
  modelBadge.classList.add('hidden');
  rpcToggleBtn.disabled = true;
  updateRPCUI();
}

export async function selectSession(id) {
  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }

  // Stop previous RPC if switching sessions
  if (rpcRunning && activeSession && activeSession !== id) {
    try {
      await fetch('/api/rpc/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSession }),
      });
    } catch (e) {}
    setRpcRunning(false);
  }

  setActiveSession(id);

  let sessionInfo = null;
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (res.ok) {
      sessionInfo = await res.json();
      setActiveSessionPath(sessionInfo.file);
    }
  } catch (e) {}

  let headerHTML = '';
  if (sessionInfo) {
    if (sessionInfo.project) {
      headerHTML += `<span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style="background:color-mix(in srgb, #cba6f7 20%, transparent); color:#cba6f7">${escapeHTML(sessionInfo.project)}</span>`;
    }
    if (sessionInfo.cwd) {
      const cwdShort = sessionInfo.cwd.length > 50 ? '...' + sessionInfo.cwd.slice(-47) : sessionInfo.cwd;
      headerHTML += `<span class="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap text-ctp-overlay0" style="background:color-mix(in srgb, #585b70 20%, transparent)">${escapeHTML(cwdShort)}</span>`;
    }
    if (sessionInfo.line_count) {
      headerHTML += `<span class="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap text-ctp-overlay0" style="background:color-mix(in srgb, #585b70 20%, transparent)">${sessionInfo.line_count} lines</span>`;
    }
  }
  if (!headerHTML) {
    headerHTML = `<span class="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style="background:color-mix(in srgb, #cba6f7 20%, transparent); color:#cba6f7">${escapeHTML(id.substring(0, 12))}...</span>`;
  }
  document.getElementById('headerInfo').innerHTML = headerHTML;

  // Update model badge
  const modelBadge = document.getElementById('modelBadge');
  if (sessionInfo && sessionInfo.model) {
    modelBadge.textContent = sessionInfo.model;
    modelBadge.classList.remove('hidden');
  } else {
    modelBadge.classList.add('hidden');
  }

  rpcToggleBtn.disabled = false;

  // Clear chat
  clearSeenEvents();
  chatMessages.innerHTML = '';
  const es = document.createElement('div');
  es.id = 'emptyState';
  es.className = 'flex items-center justify-center h-full text-ctp-overlay0 text-sm';
  es.textContent = 'Select a session and start RPC to begin chatting';
  chatMessages.appendChild(es);

  updateRPCUI();

  const { ws } = await import('./state.js');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', session_id: id }));
  }

  document.querySelectorAll('.session-item').forEach(el => {
    el.classList.remove('bg-ctp-surface0', 'border-l-[3px]', 'border-ctp-blue');
    el.classList.add('border-b', 'border-ctp-surface0');
  });
  const activeEl = document.querySelector(`.session-item[onclick*="${id}"]`);
  if (activeEl) {
    activeEl.classList.add('bg-ctp-surface0', 'border-l-[3px]', 'border-ctp-blue');
    activeEl.classList.remove('border-b', 'border-ctp-surface0');
  }
}

export function showNewSessionModal() {
  document.getElementById('newSessionModal').classList.remove('hidden');
  document.getElementById('newSessionCwd').value = '';
  document.getElementById('newSessionError').classList.add('hidden');
  document.getElementById('newSessionErrorText').textContent = '';
  setTimeout(() => document.getElementById('newSessionCwd').focus(), 100);
}

export function hideNewSessionModal() {
  document.getElementById('newSessionModal').classList.add('hidden');
}

export function showNewSessionError(msg) {
  const el = document.getElementById('newSessionError');
  const textEl = document.getElementById('newSessionErrorText');
  textEl.textContent = msg;
  el.classList.remove('hidden');
}

export async function createNewSession() {
  const cwd = document.getElementById('newSessionCwd').value.trim();
  if (!cwd) {
    showNewSessionError('Please enter a working directory');
    return;
  }

  const btn = document.getElementById('createSessionBtn');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const res = await fetch('/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd }),
    });

    if (!res.ok) {
      const err = await res.text();
      showNewSessionError(err);
      return;
    }

    const data = await res.json();
    hideNewSessionModal();

    // Refresh session list
    htmx.ajax('GET', '/sessions', { target: '#sessionList', swap: 'innerHTML' });

    // Auto-select the new session
    if (data.session_id) {
      setTimeout(() => selectSession(data.session_id), 500);
    }
  } catch (e) {
    showNewSessionError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create & Start';
  }
}

// Helper
function escapeHTML(str) {
  if (typeof str !== 'string') {
    str = str == null ? '' : String(str);
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
