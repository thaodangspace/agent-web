package jsonl

import (
	"encoding/json"
	"strings"
)

func ParseCodexSessionMeta(line []byte) (CodexSessionMeta, bool) {
	var env CodexEnvelope
	if err := json.Unmarshal(line, &env); err != nil {
		return CodexSessionMeta{}, false
	}
	if env.Type != "session_meta" {
		return CodexSessionMeta{}, false
	}
	var payload CodexSessionMeta
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		return CodexSessionMeta{}, false
	}
	return payload, true
}

func IsCodexUserSession(meta CodexSessionMeta) bool {
	if meta.ID == "" {
		return false
	}
	if meta.ThreadSource == "subagent" {
		return false
	}
	if sourceNamesInternalCodexSession(meta.Source) {
		return false
	}
	model := strings.ToLower(meta.Model)
	if strings.Contains(model, "codex-auto-review") || strings.Contains(model, "guardian") {
		return false
	}
	if meta.ThreadSource == "user" {
		return true
	}
	return meta.ThreadSource == ""
}

func sourceNamesInternalCodexSession(raw json.RawMessage) bool {
	if len(raw) == 0 || string(raw) == "null" {
		return false
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		v := strings.ToLower(s)
		return strings.Contains(v, "guardian") || strings.Contains(v, "auto-review") || strings.Contains(v, "approval")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return false
	}
	if _, ok := obj["subagent"]; ok {
		return true
	}
	for key := range obj {
		v := strings.ToLower(key)
		if strings.Contains(v, "guardian") || strings.Contains(v, "auto-review") || strings.Contains(v, "approval") {
			return true
		}
	}
	return false
}
