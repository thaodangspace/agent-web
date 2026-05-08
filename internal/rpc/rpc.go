// Package rpc manages Pi RPC mode sessions.
// It spawns `pi --mode rpc --session <path>` as a subprocess and bridges
// JSONL commands/responses/events between the process and the web client.
package rpc

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// EventHandler is called for each event received from the RPC process.
type EventHandler func(event json.RawMessage)

// Session manages a single Pi RPC subprocess.
type Session struct {
	sessionID    string
	sessionPath  string
	cwd          string
	cmd          *exec.Cmd
	stdin        io.WriteCloser
	stdout       io.ReadCloser
	stderr       io.ReadCloser
	decoder      *JSONLDecoder
	handler      EventHandler
	mu           sync.Mutex
	running      bool
	quit         chan struct{}
	pendingReqs  map[string]chan json.RawMessage
	lastReqID    int
}

// JSONLDecoder reads LF-delimited JSON lines from a reader.
// Does NOT use bufio.Scanner (which splits on Unicode line separators U+2028/U+2029).
type JSONLDecoder struct {
	r   *bufio.Reader
	buf []byte
}

func NewJSONLDecoder(r io.Reader) *JSONLDecoder {
	return &JSONLDecoder{
		r:   bufio.NewReader(r),
		buf: make([]byte, 0, 64*1024),
	}
}

// ReadLine reads a single JSON line. Returns (line, nil) or (nil, error).
// Strips trailing \r\n or \n.
func (d *JSONLDecoder) ReadLine() ([]byte, error) {
	for {
		b, err := d.r.ReadByte()
		if err != nil {
			if len(d.buf) == 0 {
				if err == io.EOF {
					return nil, io.EOF
				}
				return nil, err
			}
			line := d.buf
			d.buf = make([]byte, 0, 64*1024)
			return trimLine(line), nil
		}

		if b == '\n' {
			line := d.buf
			d.buf = make([]byte, 0, 64*1024)
			return trimLine(line), nil
		}

		d.buf = append(d.buf, b)

		if len(d.buf) > 1024*1024 {
			return nil, fmt.Errorf("line too long (>1MB)")
		}
	}
}

func trimLine(line []byte) []byte {
	if len(line) > 0 && line[len(line)-1] == '\r' {
		line = line[:len(line)-1]
	}
	return line
}

// NewSession creates a new RPC session for the given session file.
func NewSession(sessionID, sessionPath string, handler EventHandler) *Session {
	return NewSessionWithCWD(sessionID, sessionPath, "", handler)
}

// NewSessionWithCWD creates a new RPC session with a custom working directory.
func NewSessionWithCWD(sessionID, sessionPath, cwd string, handler EventHandler) *Session {
	return &Session{
		sessionID:   sessionID,
		sessionPath: sessionPath,
		cwd:         cwd,
		handler:     handler,
		quit:        make(chan struct{}),
		pendingReqs: make(map[string]chan json.RawMessage),
	}
}

// Start spawns the Pi RPC process.
func (s *Session) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("session %s already running", s.sessionID)
	}
	s.mu.Unlock()

	args := []string{
		"--mode", "rpc",
		"--session", s.sessionPath,
	}

	log.Printf("[rpc] starting: pi %s", strings.Join(args, " "))

	s.cmd = exec.Command("pi", args...)
	s.cmd.Dir = s.cwd

	stdin, err := s.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}

	stdout, err := s.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := s.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := s.cmd.Start(); err != nil {
		return fmt.Errorf("start pi: %w", err)
	}

	s.stdin = stdin
	s.stdout = stdout
	s.stderr = stderr
	s.decoder = NewJSONLDecoder(stdout)
	s.running = true

	log.Printf("[rpc] started (pid=%d) session=%s", s.cmd.Process.Pid, s.sessionID)

	go s.readStderr()
	go s.readEvents()

	return nil
}

// Stop terminates the Pi RPC process.
// Per the RPC protocol docs, closing stdin is the documented way to terminate the process.
// We close stdin first, then fall back to SIGINT/SIGKILL if it doesn't exit gracefully.
func (s *Session) Stop() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	log.Printf("[rpc] stopping session=%s", s.sessionID)
	close(s.quit)

	if s.cmd.Process != nil {
		// Close stdin first to trigger graceful exit per the RPC protocol
		if s.stdin != nil {
			s.stdin.Close()
		}

		done := make(chan struct{})
		go func() {
			s.cmd.Wait()
			close(done)
		}()

		select {
		case <-done:
		case <-time.After(3 * time.Second):
			// stdin close didn't work — fall back to SIGINT
			s.cmd.Process.Signal(os.Interrupt)
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				s.cmd.Process.Kill()
			}
		}
	}

	s.mu.Lock()
	s.running = false
	s.mu.Unlock()

	log.Printf("[rpc] stopped session=%s", s.sessionID)
	return nil
}

// SendCommand sends a JSON command to the RPC process (LF-delimited).
func (s *Session) SendCommand(cmd map[string]interface{}) error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return fmt.Errorf("session %s not running", s.sessionID)
	}
	s.mu.Unlock()

	data, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	data = append(data, '\n')

	s.mu.Lock()
	_, err = s.stdin.Write(data)
	s.mu.Unlock()

	if err != nil {
		return fmt.Errorf("write stdin: %w", err)
	}

	return nil
}

// SendCommandAndWait sends a command and waits for the response with a timeout.
func (s *Session) SendCommandAndWait(cmd map[string]interface{}, timeout time.Duration) (json.RawMessage, error) {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil, fmt.Errorf("session %s not running", s.sessionID)
	}

	s.lastReqID++
	reqID := fmt.Sprintf("req-%d", s.lastReqID)
	respCh := make(chan json.RawMessage, 1)
	s.pendingReqs[reqID] = respCh
	s.mu.Unlock()

	cmd["id"] = reqID

	data, err := json.Marshal(cmd)
	if err != nil {
		s.mu.Lock()
		delete(s.pendingReqs, reqID)
		s.mu.Unlock()
		return nil, fmt.Errorf("marshal: %w", err)
	}

	data = append(data, '\n')

	s.mu.Lock()
	_, err = s.stdin.Write(data)
	s.mu.Unlock()

	if err != nil {
		s.mu.Lock()
		delete(s.pendingReqs, reqID)
		s.mu.Unlock()
		return nil, fmt.Errorf("write stdin: %w", err)
	}

	select {
	case resp := <-respCh:
		return resp, nil
	case <-time.After(timeout):
		s.mu.Lock()
		delete(s.pendingReqs, reqID)
		s.mu.Unlock()
		return nil, fmt.Errorf("timeout waiting for response to %s", reqID)
	}
}

// IsRunning returns whether the session is active.
func (s *Session) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

// readEvents reads JSONL events from stdout and dispatches to handler.
func (s *Session) readEvents() {
	defer func() {
		s.mu.Lock()
		s.running = false
		s.mu.Unlock()
	}()

	for {
		select {
		case <-s.quit:
			return
		default:
		}

		line, err := s.decoder.ReadLine()
		if err != nil {
			if err == io.EOF {
				log.Printf("[rpc] stdout closed session=%s", s.sessionID)
			} else {
				log.Printf("[rpc] read error: %v", err)
			}
			return
		}

		if len(line) == 0 {
			continue
		}

		var check map[string]interface{}
		if err := json.Unmarshal(line, &check); err != nil {
			log.Printf("[rpc] invalid JSON: %v", err)
			continue
		}

		// Route responses to pending request channels
		if evtType, ok := check["type"].(string); ok && evtType == "response" {
			if reqID, ok := check["id"].(string); ok {
				s.mu.Lock()
				if respCh, hasWaiter := s.pendingReqs[reqID]; hasWaiter {
					select {
					case respCh <- json.RawMessage(line):
					default:
					}
					delete(s.pendingReqs, reqID)
				}
				s.mu.Unlock()
			}

			// Log responses for debugging
			cmd, _ := check["command"].(string)
			success, _ := check["success"].(bool)
			errMsg, _ := check["error"].(string)
			if !success || cmd == "prompt" || cmd == "get_state" {
				log.Printf("[rpc] response: session=%s command=%s success=%v error=%s", s.sessionID, cmd, success, errMsg)
			}
		} else if evtType == "agent_start" {
			log.Printf("[rpc] event: session=%s type=%s", s.sessionID, evtType)
		} else if evtType == "agent_end" {
			log.Printf("[rpc] event: session=%s type=%s", s.sessionID, evtType)
		}

		if s.handler != nil {
			s.handler(json.RawMessage(line))
		}
	}
}

// readStderr reads stderr and logs it.
func (s *Session) readStderr() {
	scanner := bufio.NewScanner(s.stderr)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		log.Printf("[rpc:stderr session=%s] %s", s.sessionID, scanner.Text())
	}
}
