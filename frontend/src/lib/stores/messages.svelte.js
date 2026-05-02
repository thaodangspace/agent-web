import { writable } from 'svelte/store';

export const messages = writable([]);
export const userScrolledUp = writable(false);
export const newMessageCount = writable(0);
