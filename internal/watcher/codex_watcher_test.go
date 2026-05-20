package watcher

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractCodexMeta(t *testing.T) {
	path := filepath.Join("/Users/dt/.codex/sessions/2026/05/19", "rollout-2026-05-19T09-39-36-019e3e1a-5f70-7511-84e4-fb07e05f6234.jsonl")
	sessionID, project := extractCodexMeta(path, "/Users/dt/code/dotfiles")
	if sessionID != "019e3e1a-5f70-7511-84e4-fb07e05f6234" {
		t.Fatalf("unexpected session id: %q", sessionID)
	}
	if project != "dotfiles" {
		t.Fatalf("unexpected project: %q", project)
	}
}

func TestCodexFileIsUserFacing(t *testing.T) {
	dir := t.TempDir()
	userFile := filepath.Join(dir, "rollout-user.jsonl")
	subFile := filepath.Join(dir, "rollout-sub.jsonl")
	if err := os.WriteFile(userFile, []byte(`{"type":"session_meta","payload":{"id":"user-1","cwd":"/tmp/project","thread_source":"user"}}`+"\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(subFile, []byte(`{"type":"session_meta","payload":{"id":"sub-1","cwd":"/tmp/project","thread_source":"subagent","source":{"subagent":{"other":"guardian"}}}}`+"\n"), 0644); err != nil {
		t.Fatal(err)
	}
	meta, ok := readCodexFileMeta(userFile)
	if !ok || meta.ID != "user-1" {
		t.Fatalf("expected user meta, got %#v ok=%v", meta, ok)
	}
	if _, ok := readCodexFileMeta(subFile); ok {
		t.Fatal("expected subagent file to be filtered")
	}
}
