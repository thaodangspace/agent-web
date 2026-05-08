import { writable } from 'svelte/store';

// Per-session commands: Map<sessionId, Array<Command>>
export const sessionCommands = writable(new Map());

// Whether commands are currently being fetched
export const commandsLoading = writable(false);
