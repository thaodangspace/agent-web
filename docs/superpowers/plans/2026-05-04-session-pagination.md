# Session Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pagination to the `/api/sessions` endpoint so it returns at most 100 sessions per page, and update the frontend to request page 1.

**Architecture:** The backend will parse a `?page=` query parameter, slice the sorted session list, and return a JSON object with `sessions` and `total`. The frontend will extract the `sessions` array from the response.

**Tech Stack:** Go (backend), Svelte/JavaScript (frontend)

---

### Task 1: Backend — Add pagination to `handleSessions`

**Files:**
- Modify: `internal/server/server.go`

- [ ] **Step 1: Modify `handleSessions` to parse `page` query parameter and return paginated response**

In `internal/server/server.go`, find the `handleSessions` function (around line 149). Replace it with:

```go
func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/sessions" {
		return
	}

	// Parse page parameter (default: 1)
	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		fmt.Sscanf(p, "%d", &page)
		if page < 1 {
			page = 1
		}
	}

	sessions := s.listSessions()
	total := len(sessions)

	// Paginate: 100 sessions per page
	const pageSize = 100
	offset := (page - 1) * pageSize
	if offset >= total {
		sessions = []SessionInfo{}
	} else {
		end := offset + pageSize
		if end > total {
			end = total
		}
		sessions = sessions[offset:end]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sessions": sessions,
		"total":    total,
	})
}
```

Also update the `handleSessions` route check in `Start()` — the current code checks `r.URL.RawQuery != ""` which would reject `?page=1`. Change:

```go
mux.HandleFunc("/api/sessions", s.handleSessions)
```

Find the `handleSessions` function and remove the `|| r.URL.RawQuery != ""` check from the condition.

- [ ] **Step 2: Verify it compiles**

Run: `go build ./cmd/server/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add internal/server/server.go
git commit -m "feat: add pagination to /api/sessions endpoint"
```

### Task 2: Frontend — Update `fetchSessions` to handle paginated response

**Files:**
- Modify: `frontend/src/lib/api/sessions.js`

- [ ] **Step 1: Update `fetchSessions` to extract `sessions` from response object**

In `frontend/src/lib/api/sessions.js`, replace the `fetchSessions` function:

```js
export async function fetchSessions() {
  const res = await fetch('/api/sessions?page=1');
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions;
}
```

- [ ] **Step 2: Verify no other callers break**

`fetchSessions` is called in:
- `App.svelte` — sets `sessions.set(list)` — still works since we return the array
- `HeaderBar.svelte` — same usage — still works

No other changes needed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api/sessions.js
git commit -m "feat: update fetchSessions for paginated API response"
```
