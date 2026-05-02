// ===== UI Module =====
import {
  rpcDot, rpcStatus, rpcToggleBtn, chatInput, sendBtn,
  inputHint, abortBtn, rpcRunning, quitSessionBtn, setIsStreaming
} from './state.js';

export function updateRPCUI() {
  if (rpcRunning) {
    rpcDot.style.background = '#a6e3a1';
    rpcStatus.textContent = 'RPC: active';
    rpcToggleBtn.textContent = 'Stop RPC';
    rpcToggleBtn.classList.remove('bg-ctp-surface0', 'text-ctp-overlay0');
    rpcToggleBtn.classList.add('bg-ctp-red/20', 'text-ctp-red');
    chatInput.disabled = false;
    chatInput.placeholder = 'Type a message...';
    sendBtn.disabled = false;
    quitSessionBtn.classList.remove('hidden');
  } else {
    rpcDot.style.background = '#6c7086';
    rpcStatus.textContent = 'RPC: idle';
    rpcToggleBtn.textContent = 'Start RPC';
    rpcToggleBtn.classList.remove('bg-ctp-red/20', 'text-ctp-red');
    rpcToggleBtn.classList.add('bg-ctp-surface0', 'text-ctp-overlay0');
    chatInput.disabled = true;
    chatInput.placeholder = 'Select a session and start RPC to chat...';
    sendBtn.disabled = true;
    quitSessionBtn.classList.add('hidden');
  }
}

export function updateStreamingUI(streaming) {
  setIsStreaming(streaming);
  inputHint.classList.toggle('hidden', !streaming);
  abortBtn.classList.toggle('hidden', !streaming);
  sendBtn.textContent = streaming ? 'Queue' : 'Send';
}

export function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

export function toggleCollapse(btn) {
  const parent = btn.closest('.thinking-block, .tool-call-block, [class*="overflow-hidden"]');
  const body = parent ? parent.querySelector('.thinking-body, .tool-result-body, .tool-args-body') : null;
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden');
  const arrow = btn.querySelector('span:first-child');
  if (arrow) arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}
