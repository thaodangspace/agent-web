import { writable } from 'svelte/store';

export const rpcRunning = writable(false);
export const isStreaming = writable(false);
