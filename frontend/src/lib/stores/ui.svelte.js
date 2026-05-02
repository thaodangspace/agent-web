import { writable } from 'svelte/store';

export const sidebarOpen = writable(false);
export const newSessionModalOpen = writable(false);

// Restore from localStorage, default to false
function getInitialGroupByProject() {
  try {
    return localStorage.getItem('groupByProject') === 'true';
  } catch {
    return false;
  }
}

export const groupByProject = writable(getInitialGroupByProject());

// Persist to localStorage
groupByProject.subscribe(value => {
  try {
    localStorage.setItem('groupByProject', String(value));
  } catch {}
});
