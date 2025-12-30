package services

import (
	"bufio"
	"io"
	"os"
	"os/exec"
	"runtime"
	"sync"

	"github.com/creack/pty"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// TerminalService manages PTY-based terminal sessions
type TerminalService struct {
	app      *application.App
	sessions map[string]*TerminalSession
	mu       sync.RWMutex
	counter  int
}

// TerminalSession represents an active terminal session
type TerminalSession struct {
	ID      string
	cmd     *exec.Cmd
	pty     *os.File
	running bool
}

// NewTerminalService creates a new TerminalService instance
func NewTerminalService() *TerminalService {
	return &TerminalService{
		sessions: make(map[string]*TerminalSession),
	}
}

// SetApp sets the Wails application reference for event emission
func (t *TerminalService) SetApp(app *application.App) {
	t.app = app
}

// GetDefaultShell returns the default shell for the current OS
func (t *TerminalService) GetDefaultShell() string {
	switch runtime.GOOS {
	case "windows":
		// Prefer PowerShell if available, fallback to cmd
		if _, err := exec.LookPath("powershell"); err == nil {
			return "powershell"
		}
		return "cmd"
	case "darwin":
		// macOS default shell
		shell := os.Getenv("SHELL")
		if shell != "" {
			return shell
		}
		return "/bin/zsh"
	default:
		// Linux and others
		shell := os.Getenv("SHELL")
		if shell != "" {
			return shell
		}
		return "/bin/bash"
	}
}

// GetDefaultDirectory returns the default working directory
func (t *TerminalService) GetDefaultDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		switch runtime.GOOS {
		case "windows":
			return "C:\\"
		default:
			return "/"
		}
	}
	return home
}

// TerminalResult contains the result of terminal operations
type TerminalResult struct {
	SessionID string `json:"sessionId"`
	Success   bool   `json:"success"`
	Error     string `json:"error,omitempty"`
}

// CreateSession creates a new terminal session
func (t *TerminalService) CreateSession(workingDir string) TerminalResult {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Use default directory if none provided
	if workingDir == "" {
		workingDir = t.GetDefaultDirectory()
	}

	// Verify working directory exists
	if _, err := os.Stat(workingDir); os.IsNotExist(err) {
		workingDir = t.GetDefaultDirectory()
	}

	// Generate session ID
	t.counter++
	sessionID := "term-" + string(rune('0'+t.counter))

	// Get the appropriate shell
	shell := t.GetDefaultShell()

	// Create command
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if shell == "powershell" {
			cmd = exec.Command("powershell", "-NoLogo", "-NoExit")
		} else {
			cmd = exec.Command("cmd")
		}
	} else {
		cmd = exec.Command(shell)
	}

	cmd.Dir = workingDir
	cmd.Env = os.Environ()

	// Start PTY
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return TerminalResult{
			Success: false,
			Error:   "Failed to start terminal: " + err.Error(),
		}
	}

	session := &TerminalSession{
		ID:      sessionID,
		cmd:     cmd,
		pty:     ptmx,
		running: true,
	}

	t.sessions[sessionID] = session

	// Start reading output in a goroutine
	go t.readOutput(session)

	return TerminalResult{
		SessionID: sessionID,
		Success:   true,
	}
}

// readOutput reads from PTY and emits events to frontend
func (t *TerminalService) readOutput(session *TerminalSession) {
	reader := bufio.NewReader(session.pty)
	buf := make([]byte, 4096)

	for session.running {
		n, err := reader.Read(buf)
		if err != nil {
			if err != io.EOF && session.running {
				// Emit error event
				if t.app != nil {
					t.app.Event.Emit("terminal-error:"+session.ID, err.Error())
				}
			}
			break
		}

		if n > 0 && t.app != nil {
			// Emit output data to frontend
			t.app.Event.Emit("terminal-output:"+session.ID, string(buf[:n]))
		}
	}

	// Session ended
	if t.app != nil {
		t.app.Event.Emit("terminal-exit:"+session.ID, "")
	}
}

// WriteInput sends input to the terminal session
func (t *TerminalService) WriteInput(sessionID string, data string) TerminalResult {
	t.mu.RLock()
	session, exists := t.sessions[sessionID]
	t.mu.RUnlock()

	if !exists {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Session not found",
		}
	}

	if !session.running {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Session not running",
		}
	}

	_, err := session.pty.WriteString(data)
	if err != nil {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Failed to write: " + err.Error(),
		}
	}

	return TerminalResult{
		SessionID: sessionID,
		Success:   true,
	}
}

// ResizeTerminal resizes the PTY
func (t *TerminalService) ResizeTerminal(sessionID string, cols uint16, rows uint16) TerminalResult {
	t.mu.RLock()
	session, exists := t.sessions[sessionID]
	t.mu.RUnlock()

	if !exists {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Session not found",
		}
	}

	err := pty.Setsize(session.pty, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})

	if err != nil {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Failed to resize: " + err.Error(),
		}
	}

	return TerminalResult{
		SessionID: sessionID,
		Success:   true,
	}
}

// CloseSession terminates a terminal session
func (t *TerminalService) CloseSession(sessionID string) TerminalResult {
	t.mu.Lock()
	defer t.mu.Unlock()

	session, exists := t.sessions[sessionID]
	if !exists {
		return TerminalResult{
			SessionID: sessionID,
			Success:   false,
			Error:     "Session not found",
		}
	}

	session.running = false

	// Close PTY
	if session.pty != nil {
		session.pty.Close()
	}

	// Kill process if still running
	if session.cmd != nil && session.cmd.Process != nil {
		session.cmd.Process.Kill()
	}

	delete(t.sessions, sessionID)

	return TerminalResult{
		SessionID: sessionID,
		Success:   true,
	}
}

// CloseAllSessions terminates all terminal sessions
func (t *TerminalService) CloseAllSessions() {
	t.mu.Lock()
	defer t.mu.Unlock()

	for id, session := range t.sessions {
		session.running = false
		if session.pty != nil {
			session.pty.Close()
		}
		if session.cmd != nil && session.cmd.Process != nil {
			session.cmd.Process.Kill()
		}
		delete(t.sessions, id)
	}
}
