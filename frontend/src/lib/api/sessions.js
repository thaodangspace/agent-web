export async function fetchSessions() {
  const res = await fetch('/api/sessions');
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSession(id) {
  const res = await fetch(`/api/sessions/${id}`);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function createSession(cwd) {
  const res = await fetch('/api/sessions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
