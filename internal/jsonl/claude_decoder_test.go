package jsonl

import (
	"encoding/json"
	"io"
	"os"
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
	// Claude Code JSONL files use single-line JSON
	content := `{"type":"permission-mode","permissionMode":"bypassPermissions","sessionId":"test-sess"}` + "\n" +
		`{"type":"user","uuid":"user-001","timestamp":"2026-05-03T10:00:00Z","cwd":"/Users/dt/code/test","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}` + "\n" +
		`{"type":"assistant","uuid":"asst-001","parentUuid":"user-001","timestamp":"2026-05-03T10:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"hi back"}]}}` + "\n"
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
