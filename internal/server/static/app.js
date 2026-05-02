// ===== App Entry Point =====
import { connectWS } from './ws.js';
import { sendMessage } from './rpc.js';
import { selectSession, showNewSessionModal, hideNewSessionModal, createNewSession, quitSession } from './session.js';
import { toggleSidebar, toggleCollapse } from './ui.js';
import { chatInput, sendBtn, rpcToggleBtn, abortBtn, chatMessages } from './state.js';
import { autoResize } from './utils.js';
import { addUserMessage, addSystemMessage } from './chat.js';

// ===== Expose to global scope for inline HTML handlers =====
window.selectSession = selectSession;
window.showNewSessionModal = showNewSessionModal;
window.hideNewSessionModal = hideNewSessionModal;
window.createNewSession = createNewSession;
window.quitSession = quitSession;
window.toggleSidebar = toggleSidebar;
window.toggleCollapse = toggleCollapse;
window.addUserMessage = addUserMessage;
window.addSystemMessage = addSystemMessage;

// ===== Event Listeners =====
function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = chatInput.value.trim();
    sendMessage(text);
    chatInput.value = '';
    autoResize(chatInput);
  }
}

chatInput.addEventListener('keydown', handleChatKey);
chatInput.addEventListener('input', () => autoResize(chatInput));

sendBtn.addEventListener('click', () => {
  const text = chatInput.value.trim();
  sendMessage(text);
  chatInput.value = '';
  autoResize(chatInput);
});

rpcToggleBtn.addEventListener('click', async () => {
  const { toggleRPC } = await import('./rpc.js');
  toggleRPC();
});

abortBtn.addEventListener('click', async () => {
  const { abortRPC } = await import('./rpc.js');
  abortRPC();
});

// Style active session after HTMX swap
document.body.addEventListener('htmx:afterOnLoad', async () => {
  const { activeSession } = await import('./state.js');
  if (activeSession) {
    const activeEl = document.querySelector(`.session-item[onclick*="${activeSession}"]`);
    if (activeEl) {
      activeEl.classList.add('bg-ctp-surface0', 'border-l-[3px]', 'border-ctp-blue');
      activeEl.classList.remove('border-b', 'border-ctp-surface0');
    }
  }
});

// ===== Initialize =====
connectWS();
