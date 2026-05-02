# Agent Web — Go Project Plan

## Goal
Watch `.pi/agent/sessions/` for JSONL file changes and stream events in real-time to browser clients via WebSocket. **Plus: Chat with sessions via Pi RPC mode.**

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Browser Client                                   │
│  (Chat UI — session list, message stream, chat input, RPC controls)      │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ WebSocket (ws://localhost:8081/ws)
                       │ REST API (/api/rpc/*)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Go Server                                      │
│                                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐                  │
│  │  File Watcher│───►│  JSONL Parser│───►│  WS Hub    │                  │
│  │  (fsnotify)  │    │  (decoder)   │    │  (broadcast│                  │
│  │              │    │              │    │   clients) │                  │
│  └──────────────┘    └──────────────┘    └─────┬──────┘                  │
│         │                                       │ RPC events             │
│         ▼                                       ▼                        │
│  ~/.pi/agent/sessions/                     ┌────────────┐                │
│  └─ <project>/                             │  RPC Mgr   │                │
│     └─ *.jsonl                             │  (map of   │                │
│                                              │ sessions) │                │
│                                              └─────┬─────┘                │
│                                                    │ spawn pi --mode rpc  │
│                                                    ▼                      │
│                                          ┌──────────────────┐            │
│                                          │ pi --mode rpc    │            │
│                                          │ --session <path> │            │
│                                          │ (subprocess)     │            │
│                                          └──────────────────┘            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
agent-web/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── internal/
│   ├── watcher/
│   │   └── watcher.go           # fsnotify file watching
│   ├── jsonl/
│   │   ├── types.go             # Go structs for JSONL events
│   │   └── decoder.go           # JSONL line-by-line decoder
│   ├── rpc/
│   │   └── rpc.go               # Pi RPC subprocess manager
│   ├── hub/
│   │   └── hub.go               # WebSocket hub (broadcast, subscribe)
│   └── server/
│       ├── server.go            # HTTP + WebSocket + RPC REST API
│       └── static/
│           └── index.html       # Chat UI dashboard
├── go.mod
├── go.sum
└── PLAN.md
```

## RPC Chat Flow

1. **User selects a session** in the sidebar → server finds the JSONL file
2. **User clicks "Start RPC"** → server spawns `pi --mode rpc --session <path>`
3. **User types a message** → server sends `{"type":"prompt","message":"..."}` via stdin
4. **Pi streams events** → server reads JSONL from stdout, broadcasts via WebSocket
5. **Browser renders** streaming text, thinking blocks, tool calls, tool results
6. **User can send more messages** while streaming (queued with `streamingBehavior: "steer"`)
7. **User clicks "Stop RPC"** → server sends SIGINT, waits for graceful shutdown

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List all sessions |
| `/api/sessions/<id>` | GET | Get session info |
| `/api/rpc/start` | POST | Start RPC session |
| `/api/rpc/stop` | POST | Stop RPC session |
| `/api/rpc/send` | POST | Send command to RPC |
| `/api/rpc/status` | GET | Get RPC session statuses |

## WebSocket Protocol

### Server → Client
```json
{"type":"event","session_id":"...","data":{...jsonl-event...}}
```

### Client → Server
```json
{"type":"subscribe","session_id":"<optional>"}
{"type":"unsubscribe","session_id":"<optional>"}
{"type":"ping"}
```

## Dependencies

- `github.com/fsnotify/fsnotify` — file system notifications
- `github.com/gorilla/websocket` — WebSocket support
- Standard library: `os/exec`, `encoding/json`, `net/http`, `bufio`

## Running

```bash
make run          # Build + run on :8081
make run-debug    # Run with go run on :8080
```

Then open http://localhost:8081
