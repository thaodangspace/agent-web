import { activeSession } from '$lib/stores/session.svelte.js';
import { rpcRunning, isStreaming } from '$lib/stores/rpc.svelte.js';
import { messages } from '$lib/stores/messages.svelte.js';
import { startRPC, stopRPC, sendRPC } from '$lib/api/rpc.js';
import { addSystemMessage } from '$lib/utils/events.js';

export async function toggleRPC() {
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (!currentActive) return;

  let currentRpc = false;
  rpcRunning.subscribe(v => { currentRpc = v; })();

  if (currentRpc) {
    try {
      await stopRPC(currentActive);
      rpcRunning.set(false);
    } catch (e) {
      console.error('RPC stop error:', e);
    }
  } else {
    try {
      await startRPC(currentActive);
      rpcRunning.set(true);
    } catch (e) {
      addSystemMessage('Failed to start RPC: ' + e.message);
    }
  }
}

export async function abortRPC() {
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  let currentRpc = false;
  rpcRunning.subscribe(v => { currentRpc = v; })();
  if (!currentActive || !currentRpc) return;
  try {
    await sendRPC(currentActive, { type: 'abort' });
  } catch (e) {
    console.error('Abort error:', e);
  }
}

export async function sendMessage(text) {
  if (!text) return;

  let currentRpc = false;
  rpcRunning.subscribe(v => { currentRpc = v; })();
  if (!currentRpc) return;

  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();

  let currentStreaming = false;
  isStreaming.subscribe(v => { currentStreaming = v; })();

  const cmd = { type: 'prompt', message: text };
  if (currentStreaming) cmd.streamingBehavior = 'steer';

  try {
    await sendRPC(currentActive, cmd);
  } catch (e) {
    addSystemMessage('Failed to send: ' + e.message);
  }
}
