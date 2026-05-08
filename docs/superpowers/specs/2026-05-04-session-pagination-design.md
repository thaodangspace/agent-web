# Session Pagination Design

**Date:** 2026-05-04

## Problem

The `/api/sessions` endpoint currently returns all sessions at once. As the number of sessions grows, this becomes inefficient in both backend processing and frontend rendering.

## Solution

Add basic pagination to the `/api/sessions` endpoint. Only page 1 is loaded on the frontend for now.

## API Changes

### `GET /api/sessions?page=N`

**Query Parameters:**
- `page` (optional, default: 1) — 1-based page number
- Page size: 100 sessions per page (hardcoded)

**Response (changed from array to object):**

```json
{
  "sessions": [...],
  "total": 250
}
```

- `sessions`: array of `SessionInfo` objects for the requested page
- `total`: total number of sessions across all pages

**Backend logic:**
1. `listSessions()` scans and sorts all sessions (unchanged)
2. After sorting, compute `offset = (page - 1) * 100`
3. Return `sessions[offset : offset+100]` (clamped to array bounds)
4. Wrap in the response object with `total`

**Edge cases:**
- `page < 1`: treated as page 1
- `page` beyond available sessions: returns empty `sessions` array with correct `total`

## Frontend Changes

### `frontend/src/lib/api/sessions.js`

- `fetchSessions()` updated to call `/api/sessions?page=1`
- Extract `data.sessions` from the response object (instead of the response being the array directly)

### No other frontend changes

- Sidebar, App.svelte, HeaderBar, and session store remain unchanged
- The sidebar will simply show up to 100 sessions

## Files Modified

| File | Change |
|------|--------|
| `internal/server/server.go` | Add pagination logic to `handleSessions` |
| `frontend/src/lib/api/sessions.js` | Update `fetchSessions()` to handle paginated response |
