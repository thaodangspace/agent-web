import { writable } from 'svelte/store';

export const activeSession = writable(null);
export const activeSessionPath = writable(null);
export const sessions = writable([]);
