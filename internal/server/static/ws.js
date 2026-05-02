// ===== WebSocket Module =====
import { ws, activeSession, wsDot, wsStatus, setWs } from './state.js';
import { onWSMessage } from './chat.js';

export function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${proto}//${location.host}/ws`);
  setWs(socket);

  socket.onopen = () => {
    wsDot.style.background = '#a6e3a1';
    wsStatus.textContent = 'Connected';
    console.log('WS connected');
    if (activeSession) {
      socket.send(JSON.stringify({ type: 'subscribe', session_id: activeSession }));
    }
  };

  socket.onclose = () => {
    wsDot.style.background = '#f38ba8';
    wsStatus.textContent = 'Disconnected — reconnecting...';
    setTimeout(connectWS, 3000);
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'event') {
        onWSMessage(msg);
      }
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };
}
