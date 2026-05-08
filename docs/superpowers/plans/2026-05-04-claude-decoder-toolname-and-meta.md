# Claude Decoder: Tool-Name Tracking + Drop isMeta User Messages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two display bugs in the Claude Code JSONL decoder: (1) tool results show `toolName: "unknown"` because the decoder doesn't carry the name forward from the originating `tool_use`; (2) Skill-injected `isMeta:true` user messages render as user bubbles when they should be hidden as system context.

**Architecture:** Make `ClaudeDecoder` stateful so it can remember `tool_use_id → tool_name` mappings observed in assistant events and attach `toolName` when normalizing the matching `tool_result`. Add an `isMeta` field to the Claude event types and have `normalizeUser` drop messages where it is true. The package-level `normalizeAssistant` / `normalizeUser` helpers become methods on `*ClaudeDecoder` so they can read/write the shared map; existing tests are updated to construct a decoder.

**Tech Stack:** Go 1.x (`internal/jsonl`), table-driven tests with the standard `testing` package.

---

## File Structure

- Modify: `internal/jsonl/claude_types.go` — add `IsMeta` to `ClaudeEvent`.
- Modify: `internal/jsonl/claude_decoder.go` — add `toolNames map[string]string` to `ClaudeDecoder`; convert `normalizeClaudeLine` / `normalizeAssistant` / `normalizeUser` into methods; record tool names; attach `toolName` to tool results; drop `isMeta` user messages.
- Modify: `internal/jsonl/claude_decoder_test.go` — update existing tests for the new method-based API; add new tests for tool-name carry-forward and `isMeta` drop.

No frontend changes are needed: `frontend/src/lib/utils/events.js` already reads `msg.toolName` and falls back to `'unknown'` when missing (`events.js:193,285`), so populating the field fixes the UI automatically.

---

## Task 1: Add `IsMeta` field to `ClaudeEvent`

**Files:**
- Modify: `internal/jsonl/claude_types.go:14-23`

- [ ] **Step 1: Add the field**

Edit `internal/jsonl/claude_types.go`. Find the `ClaudeEvent` struct and add `IsMeta` after `SessionID`:

```go
type ClaudeEvent struct {
	Type       string                `json:"type"`
	UUID       string                `json:"uuid"`
	ParentUUID *string               `json:"parentUuid"`
	Timestamp  string                `json:"timestamp"`
	CWD        string                `json:"cwd"`
	SessionID  string                `json:"sessionId"`
	IsMeta     bool                  `json:"isMeta,omitempty"`
	Message    *ClaudeMessage        `json:"message,omitempty"`
	Raw        json.RawMessage       `json:"-"`
}
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./internal/jsonl/...`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add internal/jsonl/claude_types.go
git commit -m "feat(jsonl): add IsMeta field to ClaudeEvent"
```

---

## Task 2: Convert decoder helpers into methods (refactor, no behavior change)

The next two tasks need `normalizeAssistant` / `normalizeUser` to access shared decoder state. Convert them to methods first, with no behavior change, then add behavior in later tasks. Existing tests must keep passing.

**Files:**
- Modify: `internal/jsonl/claude_decoder.go:72-310`
- Modify: `internal/jsonl/claude_decoder_test.go:34, 85, 122, 158, 179, 209, 218`

- [ ] **Step 1: Update `processLine` to call methods**

In `internal/jsonl/claude_decoder.go`, replace the body of `processLine` so it delegates to a new method `d.normalizeClaudeLine`:

```go
func (d *ClaudeDecoder) processLine(raw string) (*Event, error) {
	normalized, drop := d.normalizeClaudeLine(raw)
	if drop {
		return nil, nil
	}

	var wrapper struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	if err := json.Unmarshal([]byte(normalized), &wrapper); err != nil {
		return nil, nil
	}

	ev := &Event{
		Type: wrapper.Type,
		ID:   wrapper.ID,
		Raw:  json.RawMessage(normalized),
	}

	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal([]byte(normalized), &rawMap); err == nil {
		if v, ok := rawMap["parentId"]; ok && string(v) != "null" {
			var s string
			json.Unmarshal(v, &s)
			ev.ParentID = &s
		}
		if v, ok := rawMap["timestamp"]; ok {
			json.Unmarshal(v, &ev.Timestamp)
		}
	}

	return ev, nil
}
```

- [ ] **Step 2: Convert `normalizeClaudeLine` to a method**

Change the signature from `func normalizeClaudeLine(raw string) (string, bool)` to `func (d *ClaudeDecoder) normalizeClaudeLine(raw string) (string, bool)` and update the two helper calls inside it:

```go
func (d *ClaudeDecoder) normalizeClaudeLine(raw string) (string, bool) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(raw), &base); err != nil {
		return "", true
	}

	switch base.Type {
	case "permission-mode", "attachment", "file-history-snapshot", "last-prompt":
		return "", true
	case "assistant":
		return d.normalizeAssistant(raw)
	case "user":
		return d.normalizeUser(raw)
	case "ai-title", "system":
		return raw, false
	default:
		return raw, false
	}
}
```

- [ ] **Step 3: Convert `normalizeAssistant` to a method**

Change `func normalizeAssistant(raw string) (string, bool)` to `func (d *ClaudeDecoder) normalizeAssistant(raw string) (string, bool)`. Body is unchanged for now.

- [ ] **Step 4: Convert `normalizeUser` to a method**

Change `func normalizeUser(raw string) (string, bool)` to `func (d *ClaudeDecoder) normalizeUser(raw string) (string, bool)`. Body is unchanged for now.

- [ ] **Step 5: Update existing tests to call methods on a decoder**

In `internal/jsonl/claude_decoder_test.go`, add a small helper at the top of the file (after the imports):

```go
func newTestDecoder() *ClaudeDecoder {
	return &ClaudeDecoder{}
}
```

Then update every direct call to the helpers:

- `normalizeAssistant(input)` → `newTestDecoder().normalizeAssistant(input)` (lines 34 and 85)
- `normalizeUser(input)` → `newTestDecoder().normalizeUser(input)` (lines 122, 158, 179)
- `normalizeClaudeLine(input)` → `newTestDecoder().normalizeClaudeLine(input)` (lines 209 and 218)

- [ ] **Step 6: Run tests to verify the refactor is behavior-preserving**

Run: `go test ./internal/jsonl/...`
Expected: PASS (all existing tests still pass).

- [ ] **Step 7: Commit**

```bash
git add internal/jsonl/claude_decoder.go internal/jsonl/claude_decoder_test.go
git commit -m "refactor(jsonl): convert claude normalize helpers to methods"
```

---

## Task 3: Drop `isMeta:true` user messages

**Files:**
- Modify: `internal/jsonl/claude_decoder.go` — `normalizeUser` method
- Modify: `internal/jsonl/claude_decoder_test.go` — add test

- [ ] **Step 1: Write the failing test**

Append to `internal/jsonl/claude_decoder_test.go`:

```go
func TestNormalizeUser_DropsIsMeta(t *testing.T) {
	// Skill-injected content arrives as a user message with isMeta:true.
	// We drop it so the skill body doesn't render as user input.
	input := `{
		"type": "user",
		"uuid": "meta-001",
		"timestamp": "2026-05-04T14:43:10.386Z",
		"isMeta": true,
		"message": {
			"role": "user",
			"content": [
				{"type": "text", "text": "Base directory for this skill: /tmp/skills/foo\n# Foo Skill\n..."}
			]
		}
	}`

	_, drop := newTestDecoder().normalizeUser(input)
	if !drop {
		t.Fatal("expected isMeta:true user message to be dropped")
	}
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `go test ./internal/jsonl/ -run TestNormalizeUser_DropsIsMeta -v`
Expected: FAIL with `expected isMeta:true user message to be dropped`.

- [ ] **Step 3: Implement the drop**

In `internal/jsonl/claude_decoder.go`, near the top of `normalizeUser`, after the `evt.Message == nil` guard, add:

```go
func (d *ClaudeDecoder) normalizeUser(raw string) (string, bool) {
	var evt ClaudeEvent
	if err := json.Unmarshal([]byte(raw), &evt); err != nil {
		return "", true
	}
	if evt.Message == nil {
		return "", true
	}
	if evt.IsMeta {
		return "", true
	}
	// ... rest unchanged ...
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `go test ./internal/jsonl/ -run TestNormalizeUser_DropsIsMeta -v`
Expected: PASS.

- [ ] **Step 5: Run the full package to confirm nothing else broke**

Run: `go test ./internal/jsonl/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/jsonl/claude_decoder.go internal/jsonl/claude_decoder_test.go
git commit -m "feat(jsonl): drop isMeta user messages from claude decoder"
```

---

## Task 4: Track `tool_use_id → tool_name` in the decoder

**Files:**
- Modify: `internal/jsonl/claude_decoder.go` — `ClaudeDecoder` struct, `NewClaudeDecoder`, `normalizeAssistant`
- Modify: `internal/jsonl/claude_decoder_test.go` — add test

- [ ] **Step 1: Write the failing test**

Append to `internal/jsonl/claude_decoder_test.go`:

```go
func TestNormalizeAssistant_RecordsToolNames(t *testing.T) {
	dec := &ClaudeDecoder{toolNames: map[string]string{}}

	input := `{
		"type": "assistant",
		"uuid": "asst-001",
		"timestamp": "2026-05-03T10:00:00Z",
		"message": {
			"role": "assistant",
			"content": [
				{"type": "tool_use", "id": "toolu_abc", "name": "Read", "input": {"file_path": "/x"}},
				{"type": "tool_use", "id": "toolu_def", "name": "Bash", "input": {"command": "ls"}}
			]
		}
	}`

	if _, drop := dec.normalizeAssistant(input); drop {
		t.Fatal("expected not to drop")
	}

	if got := dec.toolNames["toolu_abc"]; got != "Read" {
		t.Errorf("toolu_abc: expected Read, got %q", got)
	}
	if got := dec.toolNames["toolu_def"]; got != "Bash" {
		t.Errorf("toolu_def: expected Bash, got %q", got)
	}
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `go test ./internal/jsonl/ -run TestNormalizeAssistant_RecordsToolNames -v`
Expected: FAIL — `toolNames` field doesn't exist on `ClaudeDecoder`.

- [ ] **Step 3: Add the map to the struct and constructor**

In `internal/jsonl/claude_decoder.go`, update the struct:

```go
type ClaudeDecoder struct {
	path      string
	offset    int64
	file      *os.File
	reader    *bufio.Reader
	toolNames map[string]string // tool_use_id -> tool name, populated from assistant events
}
```

And update `NewClaudeDecoder` to initialize it:

```go
return &ClaudeDecoder{
	path:      path,
	offset:    offset,
	file:      f,
	reader:    bufio.NewReader(f),
	toolNames: make(map[string]string),
}, nil
```

Also update `newTestDecoder` in the test file so test cases that don't set the map directly still work:

```go
func newTestDecoder() *ClaudeDecoder {
	return &ClaudeDecoder{toolNames: map[string]string{}}
}
```

- [ ] **Step 4: Record names inside `normalizeAssistant`**

In the `case "tool_use":` branch of `normalizeAssistant`, record the mapping before marshaling the block:

```go
case "tool_use":
	if d.toolNames != nil && block.ID != "" && block.Name != "" {
		d.toolNames[block.ID] = block.Name
	}
	b, _ := json.Marshal(map[string]interface{}{
		"type":      "toolCall",
		"id":        block.ID,
		"name":      block.Name,
		"arguments": block.Input,
	})
	normalizedContent = append(normalizedContent, b)
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `go test ./internal/jsonl/ -run TestNormalizeAssistant_RecordsToolNames -v`
Expected: PASS.

- [ ] **Step 6: Run the full package**

Run: `go test ./internal/jsonl/...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/jsonl/claude_decoder.go internal/jsonl/claude_decoder_test.go
git commit -m "feat(jsonl): record tool_use id->name mapping in claude decoder"
```

---

## Task 5: Attach `toolName` to normalized tool results

**Files:**
- Modify: `internal/jsonl/claude_decoder.go` — `normalizeUser` tool_result branch
- Modify: `internal/jsonl/claude_decoder_test.go` — add test, update `TestNormalizeUser_ToolResult`

- [ ] **Step 1: Write the failing test**

Append to `internal/jsonl/claude_decoder_test.go`:

```go
func TestNormalizeUser_ToolResultIncludesToolName(t *testing.T) {
	dec := &ClaudeDecoder{toolNames: map[string]string{
		"toolu_abc": "Bash",
	}}

	input := `{
		"type": "user",
		"uuid": "user-evt-001",
		"timestamp": "2026-05-03T10:00:01Z",
		"message": {
			"role": "user",
			"content": [
				{"type": "tool_result", "content": "ok", "tool_use_id": "toolu_abc"}
			]
		}
	}`

	out, drop := dec.normalizeUser(input)
	if drop {
		t.Fatal("expected not to drop")
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	msg := result["message"].(map[string]interface{})
	if msg["toolName"] != "Bash" {
		t.Errorf("expected toolName=Bash, got %v", msg["toolName"])
	}
}

func TestNormalizeUser_ToolResultUnknownToolName(t *testing.T) {
	// If we never saw the originating tool_use (e.g. resumed mid-session),
	// the toolName field is omitted so the frontend keeps its 'unknown' fallback.
	dec := &ClaudeDecoder{toolNames: map[string]string{}}

	input := `{
		"type": "user",
		"uuid": "user-evt-002",
		"timestamp": "2026-05-03T10:00:02Z",
		"message": {
			"role": "user",
			"content": [
				{"type": "tool_result", "content": "ok", "tool_use_id": "toolu_missing"}
			]
		}
	}`

	out, drop := dec.normalizeUser(input)
	if drop {
		t.Fatal("expected not to drop")
	}
	var result map[string]interface{}
	json.Unmarshal([]byte(out), &result)
	msg := result["message"].(map[string]interface{})
	if _, ok := msg["toolName"]; ok {
		t.Errorf("expected toolName to be omitted when unknown, got %v", msg["toolName"])
	}
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `go test ./internal/jsonl/ -run TestNormalizeUser_ToolResultIncludesToolName -v`
Expected: FAIL — `toolName` field not present in the output.

- [ ] **Step 3: Attach `toolName` in `normalizeUser`**

In `internal/jsonl/claude_decoder.go`, inside the `for _, block := range evt.Message.Content.AsBlocks` loop where `block.Type == "tool_result"`, build the message map and only set `toolName` when known:

```go
if block.Type == "tool_result" {
	msg := map[string]interface{}{
		"role":       "toolResult",
		"toolCallId": block.ToolUseID,
		"content":    block.Content,
		"isError":    false,
	}
	if d.toolNames != nil {
		if name, ok := d.toolNames[block.ToolUseID]; ok && name != "" {
			msg["toolName"] = name
		}
	}
	result := map[string]interface{}{
		"type":      "message",
		"id":        evt.UUID,
		"timestamp": evt.Timestamp,
		"message":   msg,
	}
	if evt.ParentUUID != nil {
		result["parentId"] = *evt.ParentUUID
	}
	out, err := json.Marshal(result)
	if err != nil {
		return "", true
	}
	return string(out), false
}
```

- [ ] **Step 4: Run the new tests and verify they pass**

Run: `go test ./internal/jsonl/ -run TestNormalizeUser_ToolResult -v`
Expected: PASS for `TestNormalizeUser_ToolResult`, `TestNormalizeUser_ToolResultIncludesToolName`, `TestNormalizeUser_ToolResultUnknownToolName`.

- [ ] **Step 5: Run the full package**

Run: `go test ./internal/jsonl/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/jsonl/claude_decoder.go internal/jsonl/claude_decoder_test.go
git commit -m "feat(jsonl): emit toolName on normalized claude tool results"
```

---

## Task 6: End-to-end verification on the real session file

**Files:** none modified — verification only.

- [ ] **Step 1: Verify the full module builds and tests pass**

Run: `go test ./...`
Expected: PASS.

- [ ] **Step 2: Spot-check the decoder against the real JSONL the user reported**

Write a tiny ad-hoc verification using the existing decoder. Run:

```bash
go run ./cmd/... 2>/dev/null || true   # just to confirm the project still builds; skip if no main
go test ./internal/jsonl/ -run TestClaudeDecoder_Next -v
```

Expected: `TestClaudeDecoder_Next` PASS.

- [ ] **Step 3: Manual UI check**

Start the server and load the reported session file:
`/Users/dt/.claude/projects/-Users-dt-code-vsee-vc-api-emr/6052a560-b98d-440b-b7e1-447ba80d40ff.jsonl`

Confirm:
- Tool result blocks now display the actual tool name (e.g., `Bash`, `Read`, `Skill`) instead of `unknown`.
- The "Systematic Debugging" skill content no longer appears as a user bubble.

If the UI still shows stale data, hard-reload the page (the frontend deduplicates by event id).

- [ ] **Step 4: Final commit (only if any incidental files changed)**

If verification produced no diffs, skip. Otherwise:

```bash
git status
# review and commit any remaining changes with a descriptive message
```
