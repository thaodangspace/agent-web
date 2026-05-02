import { writable } from 'svelte/store';

export const ws = writable(null);
export const wsConnected = writable(false);
