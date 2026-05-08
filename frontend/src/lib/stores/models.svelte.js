import { writable } from 'svelte/store';

// Per-session available models: Map<sessionId, Array<Model>>
export const availableModels = writable(new Map());

// Helper: get models for a session
export function getModelsForSession(sessionId) {
  let map;
  availableModels.subscribe(v => { map = v; })();
  return map.get(sessionId) || [];
}

// Helper: set models for a session
export function setModelsForSession(sessionId, models) {
  availableModels.update(map => {
    const next = new Map(map);
    next.set(sessionId, models);
    return next;
  });
}

// Helper: clear models for a session
export function clearModelsForSession(sessionId) {
  availableModels.update(map => {
    const next = new Map(map);
    next.delete(sessionId);
    return next;
  });
}
