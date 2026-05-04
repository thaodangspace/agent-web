# Design: Claude Code Session Streaming Support

## Status: Draft

## Goal

Add read-only viewing and live streaming of Claude Code session files to agent-web, alongside existing pi-agent session support. Users can browse, view, and watch Claude Code sessions update in real-time via the web UI.

## Scope

- **In scope**: Read-only viewing of Claude Code sessions, live streaming via WebSocket, session list integration
- **Out of scope**: Interactive RPC/chat with Claude Code sessions (that's scope C)

## Current Architecture

```
Browser ←WebSocket→ Go Server
                         ├── File Watcher (fsnotify) → ~/.pi/agent/sessions/
                         ├── JSONL Decoder (pi-agent format)
                         ├── WebSocket Hub
                         └── REST API: /api/sessions
```

## Key Differences: pi-agent vs Claude Code JSONL

### File Locations

| | pi-agent | Claude Code |
|---|----------|-------------|
| **Session dir** | `~/.pi/agent/sessions/<project>/` | `~/.claude/projects/-<pathhash>/` |
| **Filename** | `<timestamp>_<uuid>.jsonl` | `<uuid>.jsonl` |
| **Subdirectories** | Skipped (only `.jsonl` files) | `subagents/` subdirectory exists — must be skipped |

### Session Header

- **pi-agent**: First line is `{"type":"session","version":3,"id":"<uuid>","timestamp":"...","cwd":"/path/to/project"}`
- **Claude Code**: No session header. First line is `{"type":"permission-mode","permissionMode":"bypassPermissions","sessionId":"<uuid>"}`. Every subsequent event has `cwd` at the top level.

### Event Types

| pi-agent type | Claude Code type | Notes |
|---|---|---|
| `session` | *(none)* | No equivalent in Claude Code |
| `message` (role=user) | `user` | Claude uses top-level `type: "user"` |
| `message` (role=assistant) | `assistant` | Claude uses top-level `type: "assistant"` |
| `message` (role=toolResult) | *(embedded in user)* | Claude embeds tool results in `user` events as `tool_result` content blocks |
| `agent_start` / `agent_end` | *(none)* | No streaming start/end events |
| `message_update` | *(none)* | Claude doesn't emit streaming deltas in file format |
| `model_change` | *(none)* | Model info embedded in assistant messages |
| *(none)* | `attachment` | Hook lifecycle events — large, not useful for viewing |
| *(none)* | `ai-title` | AI-generated session title |
| *(none)* | `system` | Turn duration, message count |
| *(none)* | `permission-mode` | Permission mode setting |
| *(none)* | `file-history-snapshot` | File tracking state |
| *(none)* | `last-prompt` | Last prompt for resume |

### ID Scheme

| | pi-agent | Claude Code |
|---|----------|-------------|
| **Event ID** | `id` (short hash like `"db209b2f"`) | `uuid` (full UUID like `"77f2f1f5-9497-457e-b083-683690c61bca"`) |
| **Parent ID** | `parentId` | `parentUuid` |

### Tool Calls

```json
// pi-agent (inside message.content array)
{"type": "toolCall", "id": "call_q6qxh5bz", "name": "read", "arguments": {"path": "/some/file"}}

// Claude Code (inside message.content array)
{"type": "tool_use", "id": "call_pqyhx2si", "name": "Read", "input": {"file_path": "/some/file"}}
```

### Tool Results

```json
// pi-agent (separate event)
{"type": "message", "message": {"role": "toolResult", "toolCallId": "call_q6qxh5bz", "toolName": "read", "content": [...], "isError": false}}

// Claude Code (embedded in user event)
{"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "content": "...", "tool_use_id": "call_pqyhx2si"}]}}
```

### Usage / Token Counts

```json
// pi-agent
{"usage": {"input": 622, "output": 297, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 919, "cost": {"total": 0}}}

// Claude Code
{"usage": {"input_tokens": 8287, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 489, ...}}
```

### Content Blocks

| pi-agent | Claude Code |
|---|---|
| `{"type": "text", "text": "..."}` | `{"type": "text", "text": "..."}` |
| `{"type": "thinking", "thinking": "...", "thinkingSignature": "..."}` | `{"type": "thinking", "thinking": "..."}` |
| `{"type": "toolCall", "id": "...", "name": "...", "arguments": {...}}` | `{"type": "tool_use", "id": "...", "name": "...", "input": {...}}` |
| `{"type": "image", "data": "...", "mimeType": "..."}` | *(not present in file format)* |

## Approach: Unified Normalization Layer

Add a normalization layer in the Go backend that converts Claude Code events into the same format pi-agent events use. The frontend and WebSocket protocol remain unchanged.

```
Browser ←WebSocket→ Go Server
                         ├── Watcher A → ~/.pi/agent/sessions/ → pi Decoder
                         ├── Watcher B → ~/.claude/projects/ → Claude Decoder → Normalizer
                         ├── WebSocket Hub (receives normalized events from both)
                         └── REST API: /api/sessions (returns both pi and Claude sessions)
```

## File Layout

```
internal/
├── jsonl/
│   ├── types.go                  # existing: pi-agent event structs
│   ├── decoder.go                # existing: pi-agent JSONL decoder
│   ├── claude_types.go           # NEW: Claude Code event structs
│   └── claude_decoder.go         # NEW: Claude JSONL decoder + normalizer
├── watcher/
│   ├── watcher.go                # existing: pi-agent file watcher
│   └── claude_watcher.go         # NEW: Claude Code file watcher
├── hub/
│   └── hub.go                    # unchanged
└── server/
    └── server.go                 # MODIFIED: dual watchers, both dirs in session list
```

## Detailed Design

### 1. Claude Code Event Types (`internal/jsonl/claude_types.go`)

Go structs matching Claude Code's JSONL format:

```go
type ClaudeEvent struct {
    Type      string          `json:"type"`
    UUID      string          `json:"uuid"`
    ParentUUID *string        `json:"parentUuid"`
    Timestamp string          `json:"timestamp"`
    CWD       string          `json:"cwd"`
    SessionID string          `json:"sessionId"`
    Message   *ClaudeMessage  `json:"message,omitempty"`
    Raw       json.RawMessage `json:"-"`
}

type ClaudeMessage struct {
    Role       string              `json:"role"`
    Content    []ClaudeContentBlock `json:"content"`
    Model      string              `json:"model,omitempty"`
    Usage      *ClaudeUsage        `json:"usage,omitempty"`
    StopReason string              `json:"stop_reason,omitempty"`
}

type ClaudeContentBlock struct {
    Type     string          `json:"type"` // "text", "thinking", "tool_use", "tool_result"
    Text     string          `json:"text,omitempty"`
    Thinking string          `json:"thinking,omitempty"`
    ID       string          `json:"id,omitempty"`
    Name     string          `json:"name,omitempty"`
    Input    json.RawMessage `json:"input,omitempty"`       // tool_use args
    Content  string          `json:"content,omitempty"`     // tool_result content
    ToolUseID string         `json:"tool_use_id,omitempty"` // tool_result ID
}

type ClaudeUsage struct {
    InputTokens           int64 `json:"input_tokens"`
    OutputTokens          int64 `json:"output_tokens"`
    CacheCreationTokens   int64 `json:"cache_creation_input_tokens"`
    CacheReadTokens       int64 `json:"cache_read_input_tokens"`
}
```

### 2. Claude Decoder + Normalizer (`internal/jsonl/claude_decoder.go`)

Reads Claude Code JSONL and emits normalized events compatible with the existing `watcher.Event` struct. The normalizer converts Claude Code events into pi-agent format:

**Normalization rules:**

| Claude Code event | Normalized to | Notes |
|---|---|---|
| `assistant` | `{"type":"message","message":{"role":"assistant","content":[...]}}` | Convert `tool_use` → `toolCall`, `input` → `arguments` |
| `user` with `tool_result` content blocks | `{"type":"message","message":{"role":"toolResult","toolCallId":"...","toolName":"...","content":"...","isError":false}}` | Extract tool result from content array |
| `user` with text content | `{"type":"message","message":{"role":"user","content":"..."}}` | Extract text from content array |
| `ai-title` | `{"type":"ai-title","aiTitle":"..."}` | Forward as-is (metadata) |
| `system` | `{"type":"system","subtype":"...","durationMs":...}` | Forward as-is (metadata) |
| `permission-mode`, `attachment`, `file-history-snapshot`, `last-prompt` | *(dropped)* | Not useful for session viewing |

**ID normalization:** Map `uuid` → `id`, `parentUuid` → `parentId`

**Content block normalization:**
- `tool_use` → `toolCall`: rename type, rename `input` → `arguments`
- `tool_result` → toolResult message: extract `content`, map `tool_use_id` → `toolCallId`
- `thinking`: rename field from Claude's `thinking` to pi's `thinking` (same field name, no change needed)

### 3. Claude Code Watcher (`internal/watcher/claude_watcher.go`)

Similar structure to existing `watcher.go`:

- Watches `~/.claude/projects/` directory tree
- Adds fsnotify watches for all project subdirectories
- **Skips `subagents/` subdirectories** (not top-level sessions)
- Tails `.jsonl` files on create/write events
- Uses `claude_decoder.go` to read and normalize events
- Emits `watcher.Event` structs (same type as pi-agent watcher)

**Session ID extraction:** From filename `<uuid>.jsonl` (no timestamp prefix like pi-agent)

**Project extraction:** From directory name `~/.claude/projects/-<pathhash>/` — the pathhash is derived from the project path but is not human-readable. We'll use the `cwd` field from events as the project display name.

### 4. Server Changes (`internal/server/server.go`)

**`listSessions()`** — scan both directories:
- `~/.pi/agent/sessions/` → `agent: "pi"`
- `~/.claude/projects/` → `agent: "claude"`

**`onSubscribe()`** — replay callback:
- Detect agent type from session metadata
- Use appropriate decoder (pi or Claude) for replay

**`SessionInfo` struct** — add `Agent` field (already exists, currently always `"pi"`):
```go
type SessionInfo struct {
    Agent string `json:"agent"` // "pi" or "claude"
    // ... existing fields
}
```

### 5. Frontend Changes

**Minimal** — since events are normalized server-side, the existing `events.js` handles both pi and Claude sessions without modification.

**Dedup key**: The existing `seenEvents` Set uses `data.id`. Claude Code uses `uuid`. After normalization, both will have `id`, so no change needed.

**Sidebar**: Already displays `{session.agent || 'pi'}` badge. Claude sessions will show `claude`.

## Session Metadata Aggregation

Both decoders need to support the same metadata extraction for `/api/sessions`:

| Field | pi-agent source | Claude Code source |
|---|---|---|
| `cwd` | First-line `session` event `.cwd` | Any event's top-level `.cwd` |
| `model` | `model_change` event or assistant message `.model` | Assistant message `.model` |
| `input_tokens` | Assistant `.usage.input` | Assistant `.usage.input_tokens` |
| `output_tokens` | Assistant `.usage.output` | Assistant `.usage.output_tokens` |
| `total_tokens` | Assistant `.usage.totalTokens` | Sum of input + output + cache |
| `total_cost` | Assistant `.usage.cost.total` | Not available (set to 0) |
| `line_count` | Total JSONL lines | Total JSONL lines |
| `last_message_time` | Last event `.timestamp` | Last event `.timestamp` |

## Error Handling

- **Malformed JSON lines**: Skip, log warning (same as pi decoder)
- **Permission errors**: Skip directory, log warning
- **File deleted while reading**: Handle gracefully (EOF), remove from decoder map
- **Large files**: Same offset-based tailing as pi decoder — no full file reads

## Testing Strategy

1. **Unit tests** for Claude decoder/normalizer:
   - Test each event type normalization (assistant, user, tool_result)
   - Test content block conversion (tool_use → toolCall, input → arguments)
   - Test ID mapping (uuid → id, parentUuid → parentId)
   - Test edge cases: empty content, missing fields, nested structures

2. **Integration tests**:
   - Test watcher picks up new Claude session files
   - Test session list includes both pi and Claude sessions
   - Test WebSocket replay for Claude sessions
   - Test live streaming of Claude session updates

3. **Manual testing**:
   - Point at `~/.claude/projects/` with existing session files
   - Verify sidebar shows Claude sessions
   - Select a Claude session, verify messages render correctly
   - Start a new Claude Code session, verify live updates appear

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Claude Code JSONL format changes | Medium | Normalization layer isolates changes to one file |
| Very large Claude sessions (1000+ lines) | Low | Offset-based tailing handles this efficiently |
| `attachment` events with huge hook context | Medium | Normalizer drops `attachment` type |
| Claude sessions in `subagents/` dirs | Low | Watcher explicitly skips `subagents/` directories |
| Pathhash not human-readable | Low | Use `cwd` from events for display name |

## Out of Scope

- Interactive RPC/chat with Claude Code sessions (requires `claude --print --output-format=stream-json --input-format=stream-json`)
- Creating new Claude Code sessions from the web UI
- Claude Code subagent session viewing
- Session search / full-text search
- Session deletion from the web UI
