package jsonl

import "encoding/json"

type CodexEnvelope struct {
	Timestamp string          `json:"timestamp"`
	Type      string          `json:"type"`
	Payload   json.RawMessage `json:"payload"`
}

type CodexSessionMeta struct {
	ID            string          `json:"id"`
	Timestamp     string          `json:"timestamp"`
	CWD           string          `json:"cwd"`
	Originator    string          `json:"originator"`
	CLIVersion    string          `json:"cli_version"`
	Source        json.RawMessage `json:"source"`
	ThreadSource  string          `json:"thread_source"`
	ModelProvider string          `json:"model_provider"`
	Model         string          `json:"model"`
}

type CodexMessage struct {
	Type    string              `json:"type"`
	Role    string              `json:"role"`
	Content []CodexContentBlock `json:"content"`
}

type CodexContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type CodexFunctionCall struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
	CallID    string `json:"call_id"`
}

type CodexFunctionCallOutput struct {
	Type   string `json:"type"`
	CallID string `json:"call_id"`
	Output string `json:"output"`
}
