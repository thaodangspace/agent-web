# Claude Code Session Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only viewing and live streaming of Claude Code session files alongside existing pi-agent support.

**Architecture:** Add a Claude Code JSONL decoder + normalizer that converts Claude Code events into pi-agent format, a second file watcher for `~/.claude/projects/`, and wire both into the existing server/session-list/subscription pipeline. The frontend requires zero changes because events are normalized server-side.

**Tech Stack:** Go 1.23+, fsnotify, gorilla/websocket, Svelte 5 (frontend unchanged)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `internal/jsonl/claude_types.go` | Create | Go structs for Claude Code JSONL format |
| `internal/jsonl/claude_decoder.go` | Create | Claude JSONL reader + normalizer → pi-agent format |
| `internal/jsonl/claude_decoder_test.go` | Create | Unit tests for normalization |
| `internal/watcher/claude_watcher.go` | Create | fsnotify watcher for `~/.claude/projects/` |
| `internal/server/server.go` | Modify | Dual watchers, dual session dirs, agent-aware replay |
| `cmd/server/main.go` | Modify | Accept optional `--claude-projects` flag |
| `Makefile` | No change | — |
| `frontend/` | No change | — |

---

### Task 1: Claude Code Event Types

**Files:**
- Create: `internal/jsonl/claude_types.go`

- [ ] **Step 1: Create `internal/jsonl/claude_types.go`**

```go
// Package jsonl defines Go structs for both pi-agent and Claude Code JSONL event formats.
package jsonl

import "encoding/json"

// --- Claude Code event types ---

// ClaudeEvent is the top-level JSONL line for Claude Code sessions.
// Claude Code uses top-level type values like "user", "assistant", "attachment", etc.
// instead of wrapping everything in a "message" type.
type ClaudeEvent struct {
	Type       string          `json:"type"`
	UUID       string          `json:"uuid"`
	ParentUUID *string         `json:"parentUuid"`
	Timestamp  string          `json:"timestamp"`
	CWD        string          `json:"cwd"`
	SessionID  string          `json:"sessionId"`
	Message    *ClaudeMessage  `json:"message,omitempty"`
	Raw        json.RawMessage `json:"-"`
}

// ClaudeMessage is the "message" field inside assistant/user events.
type ClaudeMessage struct {
	Role       string               `json:"role"`
	Content    []ClaudeContentBlock `json:"content"`
	Model      string               `json:"model,omitempty"`
	Usage      *ClaudeUsage         `json:"usage,omitempty"`
	StopReason string               `json:"stop_reason,omitempty"`
}

// ClaudeContentBlock is a single block inside a message's content array.
type ClaudeContentBlock struct {
	Type      string          `json:"type"` // "text" | "thinking" | "tool_use" | "tool_result"
	Text      string          `json:"text,omitempty"`
	Thinking  string          `json:"thinking,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	Content   string          `json:"content,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
}

// ClaudeUsage tracks token usage for assistant messages (snake_case).
type ClaudeUsage struct {
	InputTokens         int64 `json:"input_tokens"`
	OutputTokens        int64 `json:"output_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_input_tokens"`
	CacheReadTokens     int64 `json:"cache_read_input_tokens"`
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/dt/code/agent-web && go build ./internal/jsonl/
```

Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add internal/jsonl/claude_types.go
git commit -m "feat(jsonl): add Claude Code event type structs"
```

---

### Task 2: Claude Decoder + Normalizer

**Files:**
- Create: `internal/jsonl/claude_decoder.go`

This is the core of the feature. It reads Claude Code JSONL lines and produces normalized pi-agent format events. The normalizer converts:

- `assistant` → `{"type":"message","message":{"role":"assistant","content":[...]}}`
- `user` with `tool_result` blocks → `{"type":"message","message":{"role":"toolResult",...}}`
- `user` with text content → `{"type":"message","message":{"role":"user","content":"..."}}`
- `ai-title`, `system` → forwarded as-is
- `permission-mode`, `attachment`, `file-history-snapshot`, `last-prompt` → dropped

**Key normalizations:**
- `uuid` → `id`, `parentUuid` → `parentId`
- `tool_use` → `toolCall`, `input` → `arguments`
- Claude usage fields → pi usage fields

- [ ] **Step 1: Create `internal/jsonl/claude_decoder.go`**

```go
package jsonl

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

// ClaudeDecoder reads a Claude Code JSONL file and emits normalized pi-agent format events.
type ClaudeDecoder struct {
	path   string
	offset int64
	file   *os.File
	reader *bufio.Reader
}

// NewClaudeDecoder opens a Claude Code JSONL file for reading.
func NewClaudeDecoder(path string, offset int64) (*ClaudeDecoder, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			f.Close()
			return nil, fmt.Errorf("seek %s: %w", path, err)
		}
	}
	return &ClaudeDecoder{
		path:   path,
		offset: offset,
		file:   f,
		reader: bufio.NewReader(f),
	}, nil
}

// Offset returns the current byte offset.
func (d *ClaudeDecoder) Offset() int64 { return d.offset }

// Path returns the file path.
func (d *ClaudeDecoder) Path() string { return d.path }

// Next reads the next JSONL line and returns a normalized pi-agent format event.
// Returns (nil, nil) for dropped/blank lines, (nil, io.EOF) at end of file.
func (d *ClaudeDecoder) Next() (*Event, error) {
	for {
		line, err := d.reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				if len(line) > 0 {
					// Handle last line without trailing newline
					return d.processLine(line)
				}
				return nil, io.EOF
			}
			return nil, fmt.Errorf("read %s: %w", d.path, err)
		}

		d.offset += int64(len(line))

		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		return d.processLine(trimmed)
	}
}

func (d *ClaudeDecoder) processLine(raw string) (*Event, error) {
	normalized, drop := normalizeClaudeLine(raw)
	if drop {
		return nil, nil
	}

	var wrapper struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}
	if err := json.Unmarshal([]byte(normalized), &wrapper); err != nil {
		return nil, nil // skip malformed
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

// Close releases the file handle.
func (d *ClaudeDecoder) Close() error { return d.file.Close() }

// normalizeClaudeLine converts a Claude Code JSONL line to pi-agent format.
// Returns (normalizedJSON, drop) where drop=true means the line should be ignored.
func normalizeClaudeLine(raw string) (string, bool) {
	var base struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(raw), &base); err != nil {
		return "", true
	}

	switch base.Type {
	case "permission-mode", "attachment", "file-history-snapshot", "last-prompt":
		return "", true // drop these

	case "assistant":
		return normalizeAssistant(raw)

	case "user":
		return normalizeUser(raw)

	case "ai-title", "system":
		return raw, false // forward as-is

	default:
		return raw, false // forward unknown types
	}
}

// normalizeAssistant converts a Claude "assistant" event to pi "message" format.
func normalizeAssistant(raw string) (string, bool) {
	var evt ClaudeEvent
	if err := json.Unmarshal([]byte(raw), &evt); err != nil {
		return "", true
	}
	if evt.Message == nil {
		return "", true
	}

	// Build normalized content blocks
	var normalizedContent []json.RawMessage
	for _, block := range evt.Message.Content {
		switch block.Type {
		case "text":
			b, _ := json.Marshal(map[string]string{
				"type": "text",
				"text": block.Text,
			})
			normalizedContent = append(normalizedContent, b)

		case "thinking":
			b, _ := json.Marshal(map[string]string{
				"type":        "thinking",
				"thinking":    block.Thinking,
			})
			normalizedContent = append(normalizedContent, b)

		case "tool_use":
			// tool_use → toolCall, input → arguments
			b, _ := json.Marshal(map[string]interface{}{
				"type":      "toolCall",
				"id":        block.ID,
				"name":      block.Name,
				"arguments": block.Input,
			})
			normalizedContent = append(normalizedContent, b)
		}
	}

	// Build the normalized message
	msg := map[string]interface{}{
		"role":    "assistant",
		"content": normalizedContent,
	}
	if evt.Message.Model != "" {
		msg["model"] = evt.Message.Model
	}
	if evt.Message.Usage != nil {
		msg["usage"] = map[string]interface{}{
			"input":       evt.Message.Usage.InputTokens,
			"output":      evt.Message.Usage.OutputTokens,
			"cacheRead":   evt.Message.Usage.CacheReadTokens,
			"cacheWrite":  evt.Message.Usage.CacheCreationTokens,
			"totalTokens": evt.Message.Usage.InputTokens + evt.Message.Usage.OutputTokens + evt.Message.Usage.CacheCreationTokens + evt.Message.Usage.CacheReadTokens,
			"cost":        map[string]float64{"total": 0},
		}
	}
	if evt.Message.StopReason != "" {
		msg["stopReason"] = evt.Message.StopReason
	}

	result := map[string]interface{}{
		"type":     "message",
		"id":       evt.UUID,
		"timestamp": evt.Timestamp,
		"message":  msg,
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

// normalizeUser converts a Claude "user" event to pi "message" format.
// Tool results are extracted into separate toolResult messages.
func normalizeUser(raw string) (string, bool) {
	var evt ClaudeEvent
	if err := json.Unmarshal([]byte(raw), &evt); err != nil {
		return "", true
	}
	if evt.Message == nil {
		return "", true
	}

	// Check if this is a tool_result message
	hasToolResults := false
	for _, block := range evt.Message.Content {
		if block.Type == "tool_result" {
			hasToolResults = true
			break
		}
	}

	if hasToolResults {
		// Convert first tool_result to pi toolResult format
		for _, block := range evt.Message.Content {
			if block.Type == "tool_result" {
				result := map[string]interface{}{
					"type":      "message",
					"id":        evt.UUID,
					"timestamp": evt.Timestamp,
					"message": map[string]interface{}{
						"role":       "toolResult",
						"toolCallId": block.ToolUseID,
						"content":    block.Content,
						"isError":    false,
					},
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
		}
	}

	// Regular user message — extract text from content blocks
	var texts []string
	for _, block := range evt.Message.Content {
		if block.Type == "text" {
			texts = append(texts, block.Text)
		}
	}

	content := strings.Join(texts, "\n")
	if content == "" {
		return "", true // no useful content
	}

	result := map[string]interface{}{
		"type":      "message",
		"id":        evt.UUID,
		"timestamp": evt.Timestamp,
		"message": map[string]interface{}{
			"role":    "user",
			"content": content,
		},
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

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/dt/code/agent-web && go build ./internal/jsonl/
```

Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add internal/jsonl/claude_decoder.go
git commit -m "feat(jsonl): add Claude Code decoder with pi-agent normalization"
```

---

### Task 3: Claude Decoder Unit Tests

**Files:**
- Create: `internal/jsonl/claude_decoder_test.go`

- [ ] **Step 1: Write tests**

```go
package jsonl

import (
	"encoding/json"
	"testing"
)

func TestNormalizeAssistant_Basic(t *testing.T) {
	input := `{
		"type": "assistant",
		"uuid": "abc-123",
		"parentUuid": "parent-456",
		"timestamp": "2026-05-03T10:00:00Z",
		"cwd": "/Users/dt/code/test",
		"sessionId": "sess-001",
		"message": {
			"role": "assistant",
			"content": [
				{"type": "text", "text": "Hello world"}
			],
			"model": "claude-sonnet-4-20250514",
			"usage": {
				"input_tokens": 100,
				"output_tokens": 50,
				"cache_creation_input_tokens": 0,
				"cache_read_input_tokens": 0
			},
			"stop_reason": "end_turn"
		}
	}`

	out, drop := normalizeAssistant(input)
	if drop {
		t.Fatal("expected not to drop")
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	if result["type"] != "message" {
		t.Errorf("expected type=message, got %v", result["type"])
	}
	if result["id"] != "abc-123" {
		t.Errorf("expected id=abc-123, got %v", result["id"])
	}
	if result["parentId"] != "parent-456" {
		t.Errorf("expected parentId=parent-456, got %v", result["parentId"])
	}

	msg := result["message"].(map[string]interface{})
	if msg["role"] != "assistant" {
		t.Errorf("expected role=assistant, got %v", msg["role"])
	}

	content := msg["content"].([]interface{})
	if len(content) != 1 {
		t.Fatalf("expected 1 content block, got %d", len(content))
	}
	block := content[0].(map[string]interface{})
	if block["type"] != "text" {
		t.Errorf("expected content type=text, got %v", block["type"])
	}
	if block["text"] != "Hello world" {
		t.Errorf("expected text='Hello world', got %v", block["text"])
	}
}

func TestNormalizeAssistant_ToolUse(t *testing.T) {
	input := `{
		"type": "assistant",
		"uuid": "abc-123",
		"timestamp": "2026-05-03T10:00:00Z",
		"message": {
			"role": "assistant",
			"content": [
				{"type": "tool_use", "id": "call_001", "name": "Read", "input": {"file_path": "/test/file.go"}}
			]
		}
	}`

	out, drop := normalizeAssistant(input)
	if drop {
		t.Fatal("expected not to drop")
	}

	var result map[string]interface{}
	json.Unmarshal([]byte(out), &result)

	msg := result["message"].(map[string]interface{})
	content := msg["content"].([]interface{})
	block := content[0].(map[string]interface{})

	if block["type"] != "toolCall" {
		t.Errorf("expected type=toolCall, got %v", block["type"])
	}
	if block["name"] != "Read" {
		t.Errorf("expected name=Read, got %v", block["name"])
	}
	if _, ok := block["arguments"]; !ok {
		t.Error("expected 'arguments' field (not 'input')")
	}
}

func TestNormalizeUser_ToolResult(t *testing.T) {
	input := `{
		"type": "user",
		"uuid": "user-evt-001",
		"parentUuid": "abc-123",
		"timestamp": "2026-05-03T10:00:01Z",
		"message": {
			"role": "user",
			"content": [
				{"type": "tool_result", "content": "file contents here", "tool_use_id": "call_001"}
			]
		}
	}`

	out, drop := normalizeUser(input)
	if drop {
		t.Fatal("expected not to drop")
	}

	var result map[string]interface{}
	json.Unmarshal([]byte(out), &result)

	if result["type"] != "message" {
		t.Errorf("expected type=message, got %v", result["type"])
	}

	msg := result["message"].(map[string]interface{})
	if msg["role"] != "toolResult" {
		t.Errorf("expected role=toolResult, got %v", msg["role"])
	}
	if msg["toolCallId"] != "call_001" {
		t.Errorf("expected toolCallId=call_001, got %v", msg["toolCallId"])
	}
	if msg["content"] != "file contents here" {
		t.Errorf("expected content='file contents here', got %v", msg["content"])
	}
}

func TestNormalizeUser_TextMessage(t *testing.T) {
	input := `{
		"type": "user",
		"uuid": "user-evt-002",
		"timestamp": "2026-05-03T10:00:02Z",
		"message": {
			"role": "user",
			"content": [
				{"type": "text", "text": "Hello from user"}
			]
		}
	}`

	out, drop := normalizeUser(input)
	if drop {
		t.Fatal("expected not to drop")
	}

	var result map[string]interface{}
	json.Unmarshal([]byte(out), &result)

	msg := result["message"].(map[string]interface{})
	if msg["role"] != "user" {
		t.Errorf("expected role=user, got %v", msg["role"])
	}
	if msg["content"] != "Hello from user" {
		t.Errorf("expected content='Hello from user', got %v", msg["content"])
	}
}

func TestNormalizeClaudeLine_DropTypes(t *testing.T) {
	dropTypes := []string{
		`{"type":"permission-mode","permissionMode":"bypassPermissions"}`,
		`{"type":"attachment","attachment":{"type":"hook_success"}}`,
		`{"type":"file-history-snapshot","messageId":"abc"}`,
		`{"type":"last-prompt","lastPrompt":"test","sessionId":"abc"}`,
	}

	for _, input := range dropTypes {
		_, drop := normalizeClaudeLine(input)
		if !drop {
			t.Errorf("expected to drop type from: %s", input[:50])
		}
	}
}

func TestNormalizeClaudeLine_ForwardUnknown(t *testing.T) {
	input := `{"type":"ai-title","aiTitle":"Test session"}`
	out, drop := normalizeClaudeLine(input)
	if drop {
		t.Fatal("expected not to drop ai-title")
	}
	if out != input {
		t.Errorf("expected passthrough, got %s", out)
	}
}

func TestClaudeDecoder_Next(t *testing.T) {
	// Create a temp file with Claude Code events
	content := `{
  "type": "permission-mode",
  "permissionMode": "bypassPermissions",
  "sessionId": "test-sess"
}
{
  "type": "user",
  "uuid": "user-001",
  "timestamp": "2026-05-03T10:00:00Z",
  "cwd": "/Users/dt/code/test",
  "message": {
    "role": "user",
    "content": [{"type": "text", "text": "hello"}]
  }
}
{
  "type": "assistant",
  "uuid": "asst-001",
  "parentUuid": "user-001",
  "timestamp": "2026-05-03T10:00:01Z",
  "message": {
    "role": "assistant",
    "content": [{"type": "text", "text": "hi back"}]
  }
}
`
	tmpfile := t.TempDir() + "/test.jsonl"
	if err := os.WriteFile(tmpfile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	dec, err := NewClaudeDecoder(tmpfile, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer dec.Close()

	// First line is permission-mode → dropped
	ev, err := dec.Next()
	if err != nil || ev != nil {
		t.Fatalf("expected nil (dropped), got ev=%v err=%v", ev, err)
	}

	// Second line is user → normalized to message
	ev, err = dec.Next()
	if err != nil {
		t.Fatal(err)
	}
	if ev.Type != "message" {
		t.Errorf("expected type=message, got %s", ev.Type)
	}

	// Third line is assistant → normalized to message
	ev, err = dec.Next()
	if err != nil {
		t.Fatal(err)
	}
	if ev.Type != "message" {
		t.Errorf("expected type=message, got %s", ev.Type)
	}

	// EOF
	ev, err = dec.Next()
	if err != io.EOF {
		t.Fatalf("expected EOF, got err=%v", err)
	}
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/dt/code/agent-web && go test ./internal/jsonl/ -v -run TestNormalize
```

Expected: all tests pass

```bash
cd /Users/dt/code/agent-web && go test ./internal/jsonl/ -v -run TestClaudeDecoder
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add internal/jsonl/claude_decoder_test.go
git commit -m "test(jsonl): add Claude decoder normalization tests"
```

---

### Task 4: Claude Code Watcher

**Files:**
- Create: `internal/watcher/claude_watcher.go`

This reuses the same `watcher.Event` struct and pattern as the existing `watcher.go`, but watches `~/.claude/projects/` and uses `ClaudeDecoder` instead of `jsonl.Decoder`.

- [ ] **Step 1: Create `internal/watcher/claude_watcher.go`**

```go
// Package watcher monitors session directories for JSONL file changes.
package watcher

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"agent-web/internal/jsonl"

	"github.com/fsnotify/fsnotify"
)

// ClaudeWatcher uses fsnotify to tail Claude Code JSONL files in ~/.claude/projects/.
type ClaudeWatcher struct {
	baseDir  string
	fsw      *fsnotify.Watcher
	decoders map[string]*claudeDecoderEntry // path -> decoder
	mu       sync.Mutex
	events   chan Event
	quit     chan struct{}
	wg       sync.WaitGroup
}

type claudeDecoderEntry struct {
	dec    *jsonl.ClaudeDecoder
	proj   string // project path (from first event's cwd)
	sessID string // session ID from filename
}

// NewClaudeWatcher creates a watcher for Claude Code session files.
func NewClaudeWatcher(baseDir string) (*ClaudeWatcher, error) {
	abs, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve path %s: %w", baseDir, err)
	}

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create fsnotify: %w", err)
	}

	w := &ClaudeWatcher{
		baseDir:  abs,
		fsw:      fsw,
		decoders: make(map[string]*claudeDecoderEntry),
		events:   make(chan Event, 1024),
		quit:     make(chan struct{}),
	}

	if err := w.addWatches(); err != nil {
		fsw.Close()
		return nil, err
	}

	return w, nil
}

// Events returns the read-only event channel.
func (w *ClaudeWatcher) Events() <-chan Event {
	return w.events
}

// Start begins watching.
func (w *ClaudeWatcher) Start() {
	w.wg.Add(2)
	go w.watchLoop()
	go w.scanLoop()
}

// Stop signals the watcher to shut down.
func (w *ClaudeWatcher) Stop() {
	close(w.quit)
	w.fsw.Close()
	w.wg.Wait()
	close(w.events)
}

func (w *ClaudeWatcher) watchLoop() {
	defer w.wg.Done()
	for {
		select {
		case ev, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			w.handleFSNotify(ev)
		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			log.Printf("[claude-watcher] error: %v", err)
		case <-w.quit:
			return
		}
	}
}

func (w *ClaudeWatcher) scanLoop() {
	defer w.wg.Done()
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			w.addWatches()
		case <-w.quit:
			return
		}
	}
}

// addWatches walks baseDir and adds watches for all subdirectories.
// Skips "subagents/" directories — those are Claude Code subagent sessions, not top-level.
func (w *ClaudeWatcher) addWatches() error {
	return filepath.WalkDir(w.baseDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			// Skip subagents directories
			if strings.HasSuffix(filepath.Base(path), "subagents") {
				return filepath.SkipDir
			}
			w.fsw.Add(path)
		}
		return nil
	})
}

func (w *ClaudeWatcher) handleFSNotify(ev fsnotify.Event) {
	if filepath.Ext(ev.Name) != ".jsonl" {
		return
	}

	// Skip subagents
	if strings.Contains(ev.Name, "/subagents/") {
		return
	}

	if ev.Op.Has(fsnotify.Create) || ev.Op.Has(fsnotify.Write) {
		w.tailFile(ev.Name)
	}
}

func (w *ClaudeWatcher) tailFile(path string) {
	w.mu.Lock()
	entry, exists := w.decoders[path]
	w.mu.Unlock()

	if !exists {
		dec, err := jsonl.NewClaudeDecoder(path, 0)
		if err != nil {
			log.Printf("[claude-watcher] open %s: %v", path, err)
			return
		}

		sessionID, project := extractClaudeMeta(path)

		entry = &claudeDecoderEntry{
			dec:    dec,
			proj:   project,
			sessID: sessionID,
		}
		w.mu.Lock()
		w.decoders[path] = entry
		w.mu.Unlock()
	}

	for {
		event, err := entry.dec.Next()
		if err != nil {
			break
		}
		if event == nil {
			continue
		}

		w.events <- Event{
			SessionID: entry.sessID,
			Project:   entry.proj,
			File:      path,
			Data:      event.Raw,
			Timestamp: time.Now(),
		}
	}
}

// extractClaudeMeta pulls session ID and project from a Claude Code session file path.
// Claude Code files are named <uuid>.jsonl in ~/.claude/projects/-<pathhash>/
func extractClaudeMeta(path string) (sessionID, project string) {
	base := filepath.Base(path)
	sessionID = strings.TrimSuffix(base, ".jsonl")

	// Project is the directory name (pathhash), but we'll update it from cwd later
	dir := filepath.Dir(path)
	project = filepath.Base(dir)

	return sessionID, project
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/dt/code/agent-web && go build ./internal/watcher/
```

Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add internal/watcher/claude_watcher.go
git commit -m "feat(watcher): add Claude Code file watcher"
```

---

### Task 5: Wire Both Watchers into the Server

**Files:**
- Modify: `internal/server/server.go`
- Modify: `cmd/server/main.go`

Changes needed:
1. `Server` struct holds both a pi watcher and a Claude watcher
2. `New()` accepts both session dirs (Claude dir is optional)
3. `Start()` subscribes both watchers to the hub
4. `listSessions()` scans both directories
5. `onSubscribe()` uses the correct decoder based on agent type
6. `aggregateSessionData()` handles both pi and Claude formats
7. `main.go` adds `--claude-projects` flag

- [ ] **Step 1: Update `cmd/server/main.go` — add `--claude-projects` flag**

Modify the existing `main.go` to accept an optional `--claude-projects` flag:

```go
// Around line 17, add after sessionsDir flag:
claudeProjectsDir := flag.String("claude-projects", "", "Path to ~/.claude/projects directory")
```

Then pass both to `server.New`:

```go
// Replace the srv creation:
srv, err := server.New(*sessionsDir, *claudeProjectsDir)
```

Full diff for `cmd/server/main.go`:

```go
func main() {
	addr := flag.String("addr", ":8081", "HTTP listen address")
	sessionsDir := flag.String("sessions", "", "Path to .pi/agent/sessions directory")
	claudeProjectsDir := flag.String("claude-projects", "", "Path to ~/.claude/projects directory")
	flag.Parse()

	// Default sessions directory
	if *sessionsDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("cannot determine home directory: %v", err)
		}
		*sessionsDir = filepath.Join(home, ".pi", "agent", "sessions")
	}

	// Default Claude projects directory
	if *claudeProjectsDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("cannot determine home directory: %v", err)
		}
		*claudeProjectsDir = filepath.Join(home, ".claude", "projects")
	}

	// Verify pi sessions directory exists
	info, err := os.Stat(*sessionsDir)
	if err != nil {
		log.Fatalf("sessions directory %s: %v", *sessionsDir, err)
	}
	if !info.IsDir() {
		log.Fatalf("sessions path is not a directory: %s", *sessionsDir)
	}

	srv, err := server.New(*sessionsDir, *claudeProjectsDir)
	if err != nil {
		log.Fatalf("create server: %v", err)
	}

	// ... rest unchanged
}
```

- [ ] **Step 2: Update `internal/server/server.go` — Server struct and New()**

Modify the `Server` struct to hold both watchers:

```go
// Around line 63, modify Server struct:
type Server struct {
	hub              *hub.Hub
	watcher          *watcher.Watcher        // pi-agent watcher
	claudeWatcher    *watcher.ClaudeWatcher  // Claude Code watcher (may be nil)
	rpcMgr           *rpcManager
	sessionsDir      string
	claudeProjectsDir string
}
```

Modify `New()` to accept both dirs:

```go
// Replace New():
func New(sessionsDir, claudeProjectsDir string) (*Server, error) {
	w, err := watcher.New(sessionsDir)
	if err != nil {
		return nil, fmt.Errorf("create watcher: %w", err)
	}

	h := hub.New()

	s := &Server{
		hub:              h,
		watcher:          w,
		rpcMgr:           newRPCManager(),
		sessionsDir:      sessionsDir,
		claudeProjectsDir: claudeProjectsDir,
	}

	// Try to create Claude watcher (optional — skip if dir doesn't exist)
	if claudeProjectsDir != "" {
		if info, err := os.Stat(claudeProjectsDir); err == nil && info.IsDir() {
			cw, err := watcher.NewClaudeWatcher(claudeProjectsDir)
			if err != nil {
				log.Printf("[server] warning: could not create Claude watcher: %v", err)
			} else {
				s.claudeWatcher = cw
				log.Printf("[server] Claude Code watcher enabled: %s", claudeProjectsDir)
			}
		} else {
			log.Printf("[server] Claude projects dir not found, skipping: %s", claudeProjectsDir)
		}
	}

	return s, nil
}
```

- [ ] **Step 3: Update `Start()` to subscribe both watchers**

In `Start()`, modify the hub subscription:

```go
// Replace the existing lines:
//     go s.hub.SubscribeWatcher(s.watcher)
//     s.watcher.Start()
// With:
go s.hub.SubscribeWatcher(s.watcher)
s.watcher.Start()

if s.claudeWatcher != nil {
	go s.hub.SubscribeClaudeWatcher(s.claudeWatcher)
	s.claudeWatcher.Start()
}
```

- [ ] **Step 4: Update `Stop()` to stop both watchers**

```go
// In Stop(), add after s.watcher.Stop():
if s.claudeWatcher != nil {
	s.claudeWatcher.Stop()
}
```

- [ ] **Step 5: Add `SubscribeClaudeWatcher` to hub**

In `internal/hub/hub.go`, add a new method:

```go
// SubscribeClaudeWatcher reads events from the Claude watcher and broadcasts them.
func (h *Hub) SubscribeClaudeWatcher(w *watcher.ClaudeWatcher) {
	for ev := range w.Events() {
		msg := WSMessage{
			Type:      "event",
			SessionID: ev.SessionID,
			Project:   ev.Project,
			Data:      ev.Data,
			Time:      ev.Timestamp,
		}
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("[hub] marshal error: %v", err)
			continue
		}
		h.broadcast <- data
	}
}
```

- [ ] **Step 6: Update `listSessions()` to scan both directories**

Replace `listSessions()` with a version that scans both dirs:

```go
func (s *Server) listSessions() []SessionInfo {
	var sessions []SessionInfo

	// Scan pi-agent sessions
	filepath.WalkDir(s.sessionsDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".jsonl") {
			return nil
		}

		info := SessionInfo{File: path, Agent: "pi"}

		dir := filepath.Dir(path)
		info.Project = filepath.Base(dir)

		base := filepath.Base(path)
		for i := len(base) - 1; i >= 0; i-- {
			if base[i] == '_' {
				info.ID = base[i+1 : len(base)-len(".jsonl")]
				break
			}
		}

		info.LineCount, info.CWD, info.Model, info.InputTokens, info.OutputTokens, info.TotalTokens, info.TotalCost, info.ContextWindow = aggregateSessionData(path, "pi")
		info.LastMessageTime = getLastMessageTime(path)

		if fi, err := d.Info(); err == nil {
			info.Timestamp = fi.ModTime()
		}

		sessions = append(sessions, info)
		return nil
	})

	// Scan Claude Code sessions
	if s.claudeProjectsDir != "" {
		filepath.WalkDir(s.claudeProjectsDir, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".jsonl") {
				return nil
			}
			// Skip subagents
			if strings.Contains(path, "/subagents/") {
				return nil
			}

			info := SessionInfo{File: path, Agent: "claude"}

			base := filepath.Base(path)
			info.ID = strings.TrimSuffix(base, ".jsonl")

			info.LineCount, info.CWD, info.Model, info.InputTokens, info.OutputTokens, info.TotalTokens, info.TotalCost, info.ContextWindow = aggregateSessionData(path, "claude")
			info.LastMessageTime = getLastMessageTime(path)

			if fi, err := d.Info(); err == nil {
				info.Timestamp = fi.ModTime()
			}

			// For Claude, project name comes from cwd (set in aggregateSessionData)
			if info.CWD != "" {
				info.Project = filepath.Base(info.CWD)
			} else {
				info.Project = filepath.Base(filepath.Dir(path))
			}

			sessions = append(sessions, info)
			return nil
		})
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Timestamp.After(sessions[j].Timestamp)
	})

	return sessions
}
```

- [ ] **Step 7: Update `aggregateSessionData()` to handle both formats**

Add an `agent` parameter and handle Claude Code's different field names:

```go
// Replace aggregateSessionData signature and body:
func aggregateSessionData(path string, agent string) (lineCount int, cwd string, model string, inputTokens, outputTokens, totalTokens int64, totalCost float64, contextWindow int64) {
	f, err := os.Open(path)
	if err != nil {
		return 0, "", "", 0, 0, 0, 0, 0
	}
	defer f.Close()

	count := 0
	buf := make([]byte, 32*1024)
	scanner := NewLineScanner(f, buf)

	for scanner.Scan() {
		count++
		line := scanner.Bytes()

		if agent == "pi" {
			// pi-agent: cwd from first-line session event
			if count == 1 {
				var first struct {
					Type string `json:"type"`
					CWD  string `json:"cwd"`
				}
				json.Unmarshal(line, &first)
				if first.Type == "session" {
					cwd = first.CWD
				}
			}
			// Look for model_change events
			if model == "" {
				var mc struct {
					Type    string `json:"type"`
					ModelID string `json:"modelId"`
				}
				if json.Unmarshal(line, &mc) == nil && mc.Type == "model_change" && mc.ModelID != "" {
					model = mc.ModelID
				}
			}
			// Look for assistant messages with model field
			if model == "" {
				var me struct {
					Type    string `json:"type"`
					Message struct {
						Role  string `json:"role"`
						Model string `json:"model"`
					} `json:"message"`
				}
				if json.Unmarshal(line, &me) == nil && me.Type == "message" && me.Message.Role == "assistant" && me.Message.Model != "" {
					model = me.Message.Model
				}
			}
			// Aggregate usage from assistant messages (pi format)
			var usageCheck struct {
				Type    string `json:"type"`
				Message struct {
					Role  string `json:"role"`
					Usage *struct {
						Input       int64 `json:"input"`
						Output      int64 `json:"output"`
						TotalTokens int64 `json:"totalTokens"`
						Cost        struct {
							Total float64 `json:"total"`
						} `json:"cost"`
					} `json:"usage"`
				} `json:"message"`
			}
			if json.Unmarshal(line, &usageCheck) == nil && usageCheck.Type == "message" && usageCheck.Message.Role == "assistant" && usageCheck.Message.Usage != nil {
				u := usageCheck.Message.Usage
				inputTokens += u.Input
				outputTokens += u.Output
				totalTokens += u.TotalTokens
				totalCost += u.Cost.Total
			}
		} else {
			// Claude Code: cwd from any event's top-level field
			if cwd == "" {
				var cwCheck struct {
					CWD string `json:"cwd"`
				}
				json.Unmarshal(line, &cwCheck)
				if cwCheck.CWD != "" {
					cwd = cwCheck.CWD
				}
			}
			// Claude Code: assistant messages with model and snake_case usage
			var claudeCheck struct {
				Type    string `json:"type"`
				Message struct {
					Role  string `json:"role"`
					Model string `json:"model"`
					Usage *struct {
						InputTokens  int64 `json:"input_tokens"`
						OutputTokens int64 `json:"output_tokens"`
					} `json:"usage"`
				} `json:"message"`
			}
			if json.Unmarshal(line, &claudeCheck) == nil && claudeCheck.Type == "assistant" && claudeCheck.Message.Role == "assistant" {
				if model == "" && claudeCheck.Message.Model != "" {
					model = claudeCheck.Message.Model
				}
				if claudeCheck.Message.Usage != nil {
					inputTokens += claudeCheck.Message.Usage.InputTokens
					outputTokens += claudeCheck.Message.Usage.OutputTokens
					totalTokens += claudeCheck.Message.Usage.InputTokens + claudeCheck.Message.Usage.OutputTokens
				}
			}
		}
	}

	contextWindow = getContextWindow(model)
	return count, cwd, model, inputTokens, outputTokens, totalTokens, totalCost, contextWindow
}
```

- [ ] **Step 8: Update `onSubscribe()` to use the correct decoder**

The `onSubscribe` callback currently uses `bufio.Scanner` to replay events. For Claude sessions, it needs to use `ClaudeDecoder` to normalize events. Modify it:

```go
func (s *Server) onSubscribe(sessionID string, client *hub.Client) {
	sessions := s.listSessions()
	var sessionFile string
	var sessionAgent string
	for i := range sessions {
		if sessions[i].ID == sessionID {
			sessionFile = sessions[i].File
			sessionAgent = sessions[i].Agent
			break
		}
	}

	if sessionFile == "" {
		log.Printf("[server] session file not found for %s", sessionID)
		return
	}

	log.Printf("[server] replaying session %s (agent=%s) from %s", sessionID, sessionAgent, sessionFile)

	f, err := os.Open(sessionFile)
	if err != nil {
		log.Printf("[server] open session file: %v", err)
		return
	}
	defer f.Close()

	if sessionAgent == "claude" {
		// Use Claude decoder to normalize events
		dec, err := jsonl.NewClaudeDecoder(sessionFile, 0)
		if err != nil {
			log.Printf("[server] open claude decoder: %v", err)
			return
		}
		defer dec.Close()

		for {
			event, err := dec.Next()
			if err != nil {
				break
			}
			if event == nil {
				continue
			}

			msg := hub.WSMessage{
				Type:      "event",
				SessionID: sessionID,
				Data:      event.Raw,
				Time:      time.Now(),
			}
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}

			select {
			case client.Send() <- data:
			default:
			}
		}
	} else {
		// pi-agent: use existing scanner approach
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

		for scanner.Scan() {
			line := scanner.Bytes()
			if len(line) == 0 {
				continue
			}

			msg := hub.WSMessage{
				Type:      "event",
				SessionID: sessionID,
				Data:      json.RawMessage(line),
				Time:      time.Now(),
			}
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}

			select {
			case client.Send() <- data:
			default:
			}
		}

		if err := scanner.Err(); err != nil && err != io.EOF {
			log.Printf("[server] scan error: %v", err)
		}
	}

	log.Printf("[server] finished replaying session %s", sessionID)
}
```

- [ ] **Step 9: Add `jsonl` import to server.go**

Add `"agent-web/internal/jsonl"` to the import block if not already present.

- [ ] **Step 10: Verify it compiles**

```bash
cd /Users/dt/code/agent-web && go build ./cmd/server/
```

Expected: no output (success)

- [ ] **Step 11: Run existing tests**

```bash
cd /Users/dt/code/agent-web && go test ./...
```

Expected: all tests pass (currently no tests, but compilation check)

- [ ] **Step 12: Commit**

```bash
git add cmd/server/main.go internal/server/server.go internal/hub/hub.go
git commit -m "feat(server): wire Claude Code watcher and dual session listing"
```

---

### Task 6: Manual Integration Testing

**Files:** No changes — just verify.

- [ ] **Step 1: Build and run**

```bash
cd /Users/dt/code/agent-web && make build && ./bin/server
```

Expected: Server starts on :8081, logs both pi and Claude watcher status

- [ ] **Step 2: Check session list API**

```bash
curl http://localhost:8081/api/sessions | python3 -m json.tool | head -40
```

Expected: Both pi and Claude sessions appear, Claude sessions have `"agent": "claude"`

- [ ] **Step 3: Verify Claude session metadata**

Look at a Claude session in the output:
- `cwd` should be populated (from the event's cwd field)
- `model` should be populated (from assistant message's model field)
- `input_tokens` / `output_tokens` should be populated
- `agent` should be `"claude"`

- [ ] **Step 4: Test WebSocket replay**

Open the web UI at http://localhost:8081, select a Claude session. Verify:
- Messages appear in the chat area
- User messages render correctly
- Assistant messages render correctly
- Tool calls render as collapsible blocks
- Tool results render correctly

- [ ] **Step 5: Test live streaming**

Start a new Claude Code session in a terminal, then watch it appear and update in the web UI.

- [ ] **Step 6: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration test findings"
```

---

## Summary of Changes

| Component | Lines Added | Lines Modified | Risk |
|-----------|------------|----------------|------|
| `jsonl/claude_types.go` | ~50 | 0 | Low — new file, pure structs |
| `jsonl/claude_decoder.go` | ~250 | 0 | Medium — normalization logic |
| `jsonl/claude_decoder_test.go` | ~180 | 0 | Low — tests only |
| `watcher/claude_watcher.go` | ~150 | 0 | Low — mirrors existing watcher |
| `server/server.go` | ~120 | ~80 | Medium — session listing + replay |
| `hub/hub.go` | ~20 | 0 | Low — new method |
| `cmd/server/main.go` | ~10 | ~5 | Low — flag addition |

**Total:** ~780 lines new, ~85 lines modified
