export async function fetchTmuxSessions() {
  const res = await fetch('/api/tmux/sessions');
  if (!res.ok) {
    throw new Error(`Failed to fetch tmux sessions: ${res.status}`);
  }
  return res.json();
}

export async function fetchTmuxWindows(sessionName) {
  const res = await fetch(`/api/tmux/sessions/${encodeURIComponent(sessionName)}/windows`);
  if (!res.ok) {
    throw new Error(`Failed to fetch tmux windows: ${res.status}`);
  }
  return res.json();
}
