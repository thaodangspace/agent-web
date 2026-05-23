import { writable } from 'svelte/store';

export const tmuxSessionPickerOpen = writable(false);
export const tmuxWindowPickerOpen = writable(false);
export const tmuxTerminalTarget = writable(null); // { session: string, window: number } | null
