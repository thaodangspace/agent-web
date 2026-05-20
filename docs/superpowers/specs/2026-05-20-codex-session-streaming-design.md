# Design: Codex Session Streaming Support

## Status: Draft

## Goal

Add read-only viewing and live streaming of Codex session files to agent-web, alongside existing pi-agent and Claude Code session support. Users should see top-level Codex conversations in the sidebar, open them in the chat view, and watch new visible events appear as the Codex session file changes.

## Scope

- **In scope**: Read-only viewing of user-facing Codex sessions, live streaming via WebSocket, session list integration, Codex JSONL normalization, read-only frontend capability labeling.
- **Out of scope**: Interactive RPC/chat with Codex sessions, sidebar entries for Codex subagent/internal sessions, reconstructing hidden subagent transcripts into parent sessions.

## Current Architecture

```
Browser <-WebSocket-> Go Server
                         |-- Watcher A -> ~/.pi/agent/sessions/ -> pi decoder
                         |-- Watcher B -> ~/.claude/projects/ -> Claude decoder -> normalizer
                         |-- WebSocket Hub
                         `-- REST API: /api/sessions
```

The existing pattern is to normalize non-pi JSONL into pi-agent-style `message` events in Go, so the frontend can consume one event shape.

## Key Differences: pi-agent, Claude Code, and Codex

| | pi-agent | Claude Code | Codex |
|---|---|---|---|
| Session dir | `~/.pi/agent/sessions/<project>/` | `~/.claude/projects/-<pathhash>/` | `~/.codex/sessions/YYYY/MM/DD/` |
| Filename | `<timestamp>_<id>.jsonl` | `<uuid>.jsonl` | `rollout-<timestamp>-<uuid>.jsonl` |
| Header | `type:"session"` | no stable session header | first line `type:"session_meta"` |
| User-facing marker | directory/file convention | top-level files, skip `subagents/` | `session_meta.payload.thread_source == "user"` |
| Internal sessions | not represented separately | `subagents/` dirs skipped | separate JSONL files with `thread_source:"subagent"` or `source.subagent` |
| Visible messages | `type:"message"` | `type:"user"` / `type:"assistant"` | `type:"response_item"` and `type:"event_msg"` |

## Recommended Approach

Add Codex as a third normalized session source.

```
Browser <-WebSocket-> Go Server
                         |-- Watcher A -> ~/.pi/agent/sessions/ -> pi decoder
                         |-- Watcher B -> ~/.claude/projects/ -> Claude decoder -> normalizer
                         |-- Watcher C -> ~/.codex/sessions/ -> Codex decoder -> normalizer
                         |-- WebSocket Hub
                         `-- REST API: /api/sessions
```

Codex support should follow the Claude model: the backend understands Codex JSONL and emits the same normalized event format the frontend already uses.

## File Layout

```
internal/
|-- jsonl/
|   |-- types.go                  # existing: normalized/pi-agent event structs
|   |-- decoder.go                # existing: pi-agent JSONL decoder
|   |-- claude_types.go           # existing: Claude Code structs
|   |-- claude_decoder.go         # existing: Claude normalizer
|   |-- codex_types.go            # new: Codex JSONL structs
|   `-- codex_decoder.go          # new: Codex JSONL decoder + normalizer
|-- watcher/
|   |-- watcher.go                # existing: pi-agent watcher
|   |-- claude_watcher.go         # existing: Claude watcher
|   `-- codex_watcher.go          # new: Codex watcher
|-- hub/
|   `-- hub.go                    # add Codex watcher subscription or generic source subscription
`-- server/
    `-- server.go                 # add Codex dir, session scan, replay, watcher startup
```

Frontend changes should be limited to read-only capability text and agent labels for `agent:"codex"`.

## Session Filtering

Only user-facing Codex sessions should appear in `/api/sessions`.

Include a Codex JSONL file when its first `session_meta` line has:

- `payload.thread_source == "user"`

For compatibility with older files, include a session with no `thread_source` only when it has no internal markers and appears to be a normal CLI session:

- no `payload.source.subagent`
- no `payload.thread_source == "subagent"`
- no auto-review or guardian model metadata

Exclude sessions when any of these are true:

- `payload.thread_source == "subagent"`
- `payload.source.subagent` exists
- `turn_context.model == "codex-auto-review"` before any visible user turn
- `session_meta.payload.source` names guardian, auto-review, or approval-review execution
- the session is missing `session_meta` or an ID

Excluded Codex sessions are not listed independently and are not tailed as standalone sidebar sessions.

## Subagent/Internal Session Handling

Subagent, auto-review, guardian, and other internal Codex JSONL files should not be spliced into parent sessions.

Their activity may appear in the parent session only when the parent JSONL already records it as visible conversation data, such as:

- approval request messages
- approval decision outputs
- tool calls
- tool results
- assistant commentary or final output

This avoids guessing parent-child relationships that are not present in the sampled Codex files.

## Codex Normalization Rules

`CodexDecoder` reads one JSONL line at a time and emits normalized `jsonl.Event` values. It drops bookkeeping entries and converts visible entries into pi-agent-style `message` events.

| Codex line | Normalized output | Notes |
|---|---|---|
| `session_meta` | dropped | Used for session metadata only |
| `turn_context` | dropped | Internal execution context |
| `event_msg.payload.type:"task_started"` | dropped | Bookkeeping |
| `event_msg.payload.type:"token_count"` | dropped | Bookkeeping |
| `event_msg.payload.type:"agent_message"` | dropped by default | Codex also records the visible text as `response_item.payload.type:"message"` in sampled files |
| `response_item.payload.type:"message"` | user or assistant message | Convert content array text blocks into normalized content |
| `response_item.payload.type:"function_call"` | assistant message with `toolCall` content | Use `name`, `call_id`, and parsed `arguments` |
| `response_item.payload.type:"function_call_output"` | `toolResult` message | Use `call_id` and `output` |
| `response_item.payload.type:"reasoning"` | dropped by default | Keep only visible summaries if they are useful and non-empty |
| unknown Codex type | dropped with debug logging | Avoid leaking internal JSON into the UI |

### Message Content

Codex message content is an array of typed blocks, commonly `input_text` or `output_text`. The decoder should concatenate visible text blocks in order, preserving line breaks. Empty content is dropped.

`response_item.payload.type:"message"` is the canonical visible-message source. `event_msg.payload.type:"agent_message"` should only be enabled later as a fallback if tests find Codex files with agent messages that lack corresponding `response_item` messages. This keeps the first implementation from duplicating assistant commentary and final answers.

### Tool Calls

Codex function calls become assistant messages with a single `toolCall` content block:

```json
{
  "type": "message",
  "id": "<call_id>",
  "timestamp": "<line timestamp>",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "toolCall",
        "id": "<call_id>",
        "name": "<function name>",
        "arguments": { "...": "..." }
      }
    ]
  }
}
```

If `arguments` is a JSON string, parse it into JSON. If parsing fails, preserve it as a string value rather than dropping the event.

### Tool Results

Codex function outputs become tool-result messages:

```json
{
  "type": "message",
  "id": "<call_id>-result",
  "timestamp": "<line timestamp>",
  "message": {
    "role": "toolResult",
    "toolCallId": "<call_id>",
    "content": [{ "type": "text", "text": "<output>" }],
    "isError": false
  }
}
```

If future Codex records include explicit failure metadata, map it to `isError`.

## Session Metadata

`listSessions()` should extract Codex metadata from `session_meta.payload`:

| SessionInfo field | Codex source |
|---|---|
| `ID` | `payload.id` |
| `Agent` | literal `"codex"` |
| `File` | JSONL path |
| `CWD` | `payload.cwd` |
| `Project` | `filepath.Base(payload.cwd)` |
| `Model` | first usable `turn_context.model`, `session_meta.payload.model`, or assistant/model metadata if available |
| `Timestamp` | file mod time, with `payload.timestamp` as fallback if needed |
| `FirstUserMessage` | first visible user `response_item` message |
| `LastMessageTime` | last parseable line timestamp |
| token/cost fields | `0` initially unless Codex exposes stable usage records |

Codex context-window metadata can reuse `getContextWindow()` when the model ID is known.

## Watcher Design

`CodexWatcher` should mirror `ClaudeWatcher`:

- watch `~/.codex/sessions/` recursively
- add watches for year/month/day directories
- tail only `.jsonl` files
- open a decoder from offset `0` for new files
- keep one decoder per path for live updates
- emit `watcher.Event` with `SessionID`, `Project`, `File`, normalized `Data`, and timestamp

The watcher should ignore excluded internal sessions. It can determine that by reading the file's first `session_meta` before creating a decoder entry. If the file has not yet received `session_meta`, defer tailing until a later write.

## Server Changes

`cmd/server/main.go` should add:

```text
-codex-sessions <path>
```

Default path:

```text
~/.codex/sessions
```

`server.New()` should accept the Codex session path. Missing Codex session directories are non-fatal, matching Claude's optional startup behavior.

`Server.Start()` should start the Codex watcher when configured. `Server.Stop()` should stop it.

`listSessions()` should scan pi-agent, Claude, and Codex sources and return a unified `[]SessionInfo`, sorted by timestamp as today.

`onSubscribe()` should replay Codex sessions through `CodexDecoder` when `SessionInfo.Agent == "codex"`.

## Frontend Behavior

Codex sessions are read-only.

- Sidebar badge displays `codex`.
- Chat input is disabled for Codex sessions.
- Placeholder text should say Codex sessions are read-only here.
- Existing message/tool rendering should work through normalized backend events.

No Codex-specific chat renderer should be introduced unless normalized events prove insufficient.

## Error Handling

- Malformed Codex lines are skipped with logging.
- Unknown Codex event types are dropped with debug logging.
- Missing `~/.codex/sessions` disables Codex support without failing server startup.
- Files without `session_meta` are ignored until they become parseable.
- Decoder errors for one file do not stop the watcher.

## Testing

Add focused Go tests for:

- user-facing vs subagent/internal session detection
- metadata extraction from `session_meta`
- first user message extraction
- assistant/user `response_item` normalization
- `event_msg.agent_message` being dropped when `response_item` messages are present
- `function_call` normalization to `toolCall`
- `function_call_output` normalization to `toolResult`
- reasoning/bookkeeping events being dropped
- replaying a sampled top-level Codex session into stable normalized events

Frontend tests should cover:

- `sessionSupportsRPC({agent:"codex"}) == false`
- Codex sessions are found and labeled consistently with existing session helpers

## Risks

| Risk | Mitigation |
|---|---|
| Codex JSONL schema changes | Keep structs tolerant, preserve raw maps where useful, and drop unknown internal entries |
| Duplicate visible messages from `event_msg` and `response_item` | Treat `response_item.payload.type:"message"` as canonical and drop `event_msg.agent_message` in the first implementation |
| Internal sessions clutter the sidebar | Filter on `session_meta.payload.thread_source` and subagent/internal markers |
| Incorrect subagent-parent merging | Do not merge hidden session files without explicit linkage |
| Large dated session tree scan cost | Reuse existing pagination, sort by file mod time, and keep parsing limited to metadata for listing |

## Non-Goals

- Starting or controlling Codex sessions from agent-web
- Sending user prompts into Codex sessions
- Displaying full hidden subagent transcripts
- Building a generic plugin architecture for arbitrary JSONL providers
- Adding a separate Codex-specific frontend message renderer
