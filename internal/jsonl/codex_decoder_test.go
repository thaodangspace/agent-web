package jsonl

import "testing"

func TestParseCodexSessionMeta_UserFacing(t *testing.T) {
	line := `{"timestamp":"2026-05-19T02:39:55.659Z","type":"session_meta","payload":{"id":"019e3e1a-5f70-7511-84e4-fb07e05f6234","timestamp":"2026-05-19T02:39:36.304Z","cwd":"/Users/dt/code/dotfiles","source":"cli","thread_source":"user","model_provider":"openai"}}`

	meta, ok := ParseCodexSessionMeta([]byte(line))
	if !ok {
		t.Fatal("expected session_meta to parse")
	}
	if meta.ID != "019e3e1a-5f70-7511-84e4-fb07e05f6234" {
		t.Fatalf("unexpected id: %q", meta.ID)
	}
	if meta.CWD != "/Users/dt/code/dotfiles" {
		t.Fatalf("unexpected cwd: %q", meta.CWD)
	}
	if !IsCodexUserSession(meta) {
		t.Fatal("expected user-facing Codex session")
	}
}

func TestParseCodexSessionMeta_DropsSubagent(t *testing.T) {
	line := `{"timestamp":"2026-05-19T02:42:17.656Z","type":"session_meta","payload":{"id":"019e3e1c-d053-7d50-b72b-a85cbf675322","cwd":"/Users/dt/code/dotfiles","source":{"subagent":{"other":"guardian"}},"thread_source":"subagent","model_provider":"openai"}}`

	meta, ok := ParseCodexSessionMeta([]byte(line))
	if !ok {
		t.Fatal("expected session_meta to parse")
	}
	if IsCodexUserSession(meta) {
		t.Fatal("expected subagent session to be excluded")
	}
}

func TestParseCodexSessionMeta_DropsMissingID(t *testing.T) {
	line := `{"timestamp":"2026-05-19T02:39:55.659Z","type":"session_meta","payload":{"cwd":"/Users/dt/code/dotfiles","thread_source":"user"}}`

	meta, ok := ParseCodexSessionMeta([]byte(line))
	if !ok {
		t.Fatal("expected session_meta to parse")
	}
	if IsCodexUserSession(meta) {
		t.Fatal("expected session with no id to be excluded")
	}
}
