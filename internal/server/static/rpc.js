// ===== RPC Control Module =====
import { activeSession, rpcRunning, setRpcRunning, ws } from './state.js';
import { updateRPCUI } from './ui.js';
import { addSystemMessage } from './chat.js';

export async function toggleRPC() {
  if (!activeSession) return;

  if (rpcRunning) {
    try {
      const res = await fetch('/api/rpc/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSession }),
      });
      if (res.ok) {
        setRpcRunning(false);
        updateRPCUI();
      }
    } catch (e) {
      console.error('RPC stop error:', e);
    }
  } else {
    try {
      const res = await fetch('/api/rpc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSession }),
      });
      if (res.ok) {
        setRpcRunning(true);
        updateRPCUI();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'subscribe', session_id: activeSession }));
        }
      } else {
        const err = await res.text();
        addSystemMessage('Failed to start RPC: ' + err);
      }
    } catch (e) {
      console.error('RPC start error:', e);
      addSystemMessage('Failed to start RPC: ' + e.message);
    }
  }
}

export async function abortRPC() {
  if (!activeSession || !rpcRunning) return;
  try {
    await fetch('/api/rpc/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSession, command: { type: 'abort' } }),
    });
  } catch (e) {
    console.error('Abort error:', e);
  }
}

export async function sendMessage(text) {
  if (!text || !rpcRunning) return;

  // Show loading indicator while waiting for server
  const { showLoadingIndicator } = await import('./chat.js');
  showLoadingIndicator();

  const cmd = { type: 'prompt', message: text };
  const { isStreaming } = await import('./state.js');
  if (isStreaming) cmd.streamingBehavior = 'steer';

  try {
    const res = await fetch('/api/rpc/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSession, command: cmd }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Send failed:', err);
      const { hideLoadingIndicator, addSystemMessage } = await import('./chat.js');
      hideLoadingIndicator();
      addSystemMessage('Failed to send: ' + err);
    }
  } catch (e) {
    console.error('Send error:', e);
    const { hideLoadingIndicator, addSystemMessage } = await import('./chat.js');
    hideLoadingIndicator();
    addSystemMessage('Send error: ' + e.message);
  }
}
