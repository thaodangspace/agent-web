import { activeSession } from '$lib/stores/session.svelte.js';
import { isStreaming, rpcAutoStarting, warnedSessions, setRpcRunning, isRpcRunning } from '$lib/stores/rpc.svelte.js';
import { messages } from '$lib/stores/messages.svelte.js';
import { startRPC, stopRPC, sendRPC } from '$lib/api/rpc.js';
import { addSystemMessage } from '$lib/utils/events.js';

/**
 * Build the prompt text with injected image paths.
 * The pi agent will use its read tool to view the referenced files.
 */
function buildPromptWithImages(text, imagePaths) {
  if (!imagePaths || imagePaths.length === 0) return text || '';

  const label = imagePaths.length === 1 ? 'Image attached' : 'Images attached';
  const pathList = imagePaths.map(p => `  - ${p}`).join('\n');
  const instruction = imagePaths.length === 1
    ? '[Use the read tool to view the image before responding]'
    : '[Use the read tool to view the images before responding]';

  return `[${label}:\n${pathList}]\n${instruction}\n\n${text || 'What do you see?'}`;
}

export async function toggleRPC() {
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (!currentActive) return;

  const currentRpc = isRpcRunning(currentActive);

  if (currentRpc) {
    try {
      await stopRPC(currentActive);
      setRpcRunning(currentActive, false);
    } catch (e) {
      console.error('RPC stop error:', e);
    }
  } else {
    try {
      await startRPC(currentActive);
      setRpcRunning(currentActive, true);
    } catch (e) {
      addSystemMessage('Failed to start RPC: ' + e.message);
    }
  }
}

export async function abortRPC() {
  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (!currentActive || !isRpcRunning(currentActive)) return;
  try {
    await sendRPC(currentActive, { type: 'abort' });
  } catch (e) {
    console.error('Abort error:', e);
  }
}

export async function sendMessage(text, imagePaths = []) {
  if (!text && imagePaths.length === 0) return;

  let currentActive = null;
  activeSession.subscribe(v => { currentActive = v; })();
  if (!currentActive) {
    addSystemMessage('No session selected');
    return;
  }

  const currentRpc = isRpcRunning(currentActive);

  // Auto-start RPC if not running
  if (!currentRpc) {
    let warnedSet = new Set();
    warnedSessions.subscribe(v => { warnedSet = new Set(v); })();

    if (!warnedSet.has(currentActive)) {
      warnedSet.add(currentActive);
      warnedSessions.set(warnedSet);
      addSystemMessage('⚡ Auto-starting RPC for this session...');
    }

    rpcAutoStarting.set(true);
    try {
      await startRPC(currentActive);
      setRpcRunning(currentActive, true);
    } catch (e) {
      rpcAutoStarting.set(false);
      addSystemMessage('Failed to start RPC: ' + e.message);
      return;
    }
    rpcAutoStarting.set(false);
  }

  let currentStreaming = false;
  isStreaming.subscribe(v => { currentStreaming = v; })();

  // Build prompt with injected image paths
  const fullText = buildPromptWithImages(text, imagePaths);

  const cmd = { type: 'prompt', message: fullText };
  if (currentStreaming) cmd.streamingBehavior = 'steer';

  try {
    await sendRPC(currentActive, cmd);
  } catch (e) {
    addSystemMessage('Failed to send: ' + e.message);
  }
}
