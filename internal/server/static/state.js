// ===== State & DOM References =====
export let activeSession = null;
export let activeSessionPath = null;
export let ws = null;
export let rpcRunning = false;
export let isStreaming = false;
export let currentAssistantEl = null;
export let userScrolledUp = false;
export let newMessageCount = 0;

export const chatMessages = document.getElementById('chatMessages');
export const chatInput = document.getElementById('chatInput');
export const sendBtn = document.getElementById('sendBtn');
export const rpcToggleBtn = document.getElementById('rpcToggleBtn');
export const abortBtn = document.getElementById('abortBtn');
export const quitSessionBtn = document.getElementById('quitSessionBtn');
export const emptyState = document.getElementById('emptyState');
export const wsDot = document.getElementById('wsDot');
export const wsStatus = document.getElementById('wsStatus');
export const rpcDot = document.getElementById('rpcDot');
export const rpcStatus = document.getElementById('rpcStatus');
export const inputHint = document.getElementById('inputHint');

// Setters
export function setActiveSession(val) { activeSession = val; }
export function setActiveSessionPath(val) { activeSessionPath = val; }
export function setWs(val) { ws = val; }
export function setRpcRunning(val) { rpcRunning = val; }
export function setIsStreaming(val) { isStreaming = val; }
export function setCurrentAssistantEl(val) { currentAssistantEl = val; }
export function setUserScrolledUp(val) { userScrolledUp = val; }
export function setNewMessageCount(val) { newMessageCount = val; }
