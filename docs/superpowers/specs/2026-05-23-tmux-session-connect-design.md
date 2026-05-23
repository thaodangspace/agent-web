---
name: tmux-session-connect-design
description: Design for detecting tmux sessions and connecting to them via embedded terminal in the web UI
metadata:
  type: project
---

# tmux Session Connect — Design Spec

**Date:** 2026-05-23  
**Status:** Draft

## Overview

Add the ability to discover all tmux sessions on the local machine and connect to them via an embedded terminal (xterm.js) in the web UI, with full bidirectional key input/output (equivalent to `tmux attach`).

## Architecture

### Data Flow

```
Browser (xterm.js)
  ↕ WebSocket (JSON frames)
Go Server
  ↕ exec.Command("tmux", ...)
tmux session (local machine)
```

### Backend — `internal/tmux/tmux.go` (new package)

#### `ListSessions() ([]Session, error)`

Parses output of `tmux list-sessions` with format string to extract:
- `name` — session name
- `windows` — window count
- `panes` — pane count  
- `created` — creation timestamp
- `attached` — whether any client is attached

Also returns `{"available": false}` if the `tmux` binary is not found.

#### `SessionAttach` — live streaming handler

```go
type SessionAttach struct {
    session     string
    mu          sync.Mutex
    lastContent string
    subs        map[chan string]bool
    stopCh      chan struct{}
}
```

- `Start()` — begins polling `tmux capture-pane -p -e -t <session>` every 200ms
- `Stop()` — stops polling, closes subscriber channels
- `Subscribe() chan string` — returns a channel receiving full pane content on each change
- `SendKeys(text string) error` — runs `tmux send-keys -t <session> -l -- <text>`
- `Resize(rows, cols int) error` — runs `tmux resize-window -t <session> -x <cols> -y <rows>`

Polling loop:
1. Capture pane content
2. If different from `lastContent`, broadcast to all subscribers
3. Update `lastContent`

Multiple WebSocket connections to the same tmux session share one `SessionAttach` instance (single polling loop).

### Backend — Server integration

**Server struct** gains:
```go
tmuxAttachers map[string]*tmux.SessionAttach  // sessionName -> shared attacher
tmuxAttachMu  sync.Mutex
```

**New routes:**
- `GET /api/tmux/sessions` — returns JSON list of tmux sessions
- `GET /ws/tmux/:session` — WebSocket upgrade, manages attach lifecycle

**WebSocket protocol** (JSON frames):
- Server → Client: `{"type": "data", "content": "<pane content with ANSI escapes>"}`
- Server → Client: `{"type": "session_end"}` — when tmux session dies
- Client → Server: `{"type": "data", "content": "<keystrokes>"}`
- Client → Server: `{"type": "resize", "cols": N, "rows": N}`

### Frontend — New components

#### `TmuxSessionPicker.svelte`

- Triggered by a new tmux icon button in the sidebar header (using `@lucide/svelte` `Terminal` icon)
- Fetches `GET /api/tmux/sessions` on open
- Lists sessions with: name, window count, attached indicator
- "Connect" button per session → opens `TmuxTerminalModal`
- Refresh button to re-fetch list
- Shows "No tmux sessions found" or "tmux not installed" states

#### `TmuxTerminalModal.svelte`

Modal overlay containing:

**Header bar:**
- tmux session name (bold)
- Status indicator (green dot = connected, red = disconnected, yellow = connecting)
- Disconnect button (X icon)
- Close button

**Terminal area:**
- xterm.js `Terminal` instance with `FitAddon`
- Lifecycle:
  1. On open: mount xterm, connect WebSocket to `/ws/tmux/<name>`
  2. On WebSocket data: `terminal.write(content)`
  3. On xterm `onData`: send `{"type": "data", "content": ...}` to WebSocket
  4. On resize: send `{"type": "resize", "cols": N, "rows": N}`
  5. On disconnect: show reconnecting banner, auto-retry with backoff (1s, 2s, 4s, max 16s)
  6. On `session_end` from server: show "Session ended" with close button
  7. On close: dispose xterm, close WebSocket, cleanup

### Frontend — Modal system

Reuse the existing modal pattern from `NewSessionModal.svelte`. The terminal modal will be its own component that manages its own open/close state via a Svelte store or local state passed from the picker.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| tmux binary not found | API returns `{available: false}`, sidebar button disabled with tooltip |
| No tmux sessions | Picker shows "No tmux sessions found" |
| WebSocket drops | Auto-reconnect with exponential backoff, show "Reconnecting..." banner in terminal |
| tmux session killed | Server sends `session_end`, terminal shows "Session ended" with close button |
| `tmux capture-pane` fails | Server closes WebSocket, client shows disconnect state |

## Scope Boundaries

### In scope (v1)
- List all tmux sessions
- Connect to active window/active pane of a session
- Full bidirectional key input/output
- Terminal resize
- Reconnect on disconnect
- Session ended detection

### Out of scope (future)
- Window/pane switching from within the UI
- Multiple pane views in one modal
- tmux control mode (`tmux -C`) integration
- Pane copy-paste UI
- Session creation from the UI

## Files Changed

### New files
- `internal/tmux/tmux.go` — tmux operations package
- `frontend/src/lib/components/TmuxSessionPicker.svelte` — session list picker
- `frontend/src/lib/components/TmuxTerminalModal.svelte` — terminal modal with xterm.js
- `frontend/src/lib/stores/tmux.svelte.js` — tmux UI state store

### Modified files
- `internal/server/server.go` — add tmux routes, attach lifecycle in `handleTmuxWS`
- `frontend/src/lib/components/Sidebar.svelte` — add tmux icon button to header
- `frontend/package.json` — add `xterm`, `xterm-addon-fit`, `xterm-addon-webgl` dependencies
