package services

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// freshLogger creates an isolated DebugLogger for testing (not the singleton).
func freshLogger(size int) *DebugLogger {
	dl := &DebugLogger{
		entries: make([]LogEntry, size),
		maxSize: size,
	}
	dl.enabled.Store(true)
	return dl
}

// withTestGlobalLogger temporarily overrides the logger singleton for a test
// without copying sync.Once values (which is flagged by go vet/staticcheck).
func withTestGlobalLogger(t *testing.T, dl *DebugLogger) {
	t.Helper()

	origLogger := globalLogger
	origHadLogger := origLogger != nil

	globalLogger = dl
	globalLoggerOnce = sync.Once{}
	globalLoggerOnce.Do(func() {}) // mark as initialised

	t.Cleanup(func() {
		globalLogger = origLogger
		globalLoggerOnce = sync.Once{}
		if origHadLogger {
			globalLoggerOnce.Do(func() {})
		}
	})
}

// ---------------------------------------------------------------------------
// Ring buffer basics
// ---------------------------------------------------------------------------

func TestDebugLogger_LogAndRetrieve(t *testing.T) {
	dl := freshLogger(10)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "hello", LogDetails{}, 42)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Message != "hello" {
		t.Errorf("expected message 'hello', got %q", entries[0].Message)
	}
	if entries[0].Duration != 42 {
		t.Errorf("expected duration 42, got %d", entries[0].Duration)
	}
	if entries[0].Level != LogLevelInfo {
		t.Errorf("expected level info, got %s", entries[0].Level)
	}
}

func TestDebugLogger_RingBufferWraps(t *testing.T) {
	dl := freshLogger(3)

	// Write 5 entries into a buffer of size 3
	for i := 0; i < 5; i++ {
		dl.forceLog(LogLevelInfo, LogCategoryCommand, "test",
			fmt.Sprintf("msg-%d", i), LogDetails{}, int64(i))
	}

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries after wrap, got %d", len(entries))
	}
	// Should contain the last 3 entries in chronological order
	if entries[0].Message != "msg-2" {
		t.Errorf("expected oldest entry 'msg-2', got %q", entries[0].Message)
	}
	if entries[2].Message != "msg-4" {
		t.Errorf("expected newest entry 'msg-4', got %q", entries[2].Message)
	}
}

func TestDebugLogger_IDsAreMonotonic(t *testing.T) {
	dl := freshLogger(100)
	for i := 0; i < 10; i++ {
		dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "msg", LogDetails{}, -1)
	}

	entries := dl.GetEntries(LogFilter{})
	for i := 1; i < len(entries); i++ {
		if entries[i].ID <= entries[i-1].ID {
			t.Errorf("entry %d ID (%d) not greater than entry %d ID (%d)",
				i, entries[i].ID, i-1, entries[i-1].ID)
		}
	}
}

// ---------------------------------------------------------------------------
// Enable / disable
// ---------------------------------------------------------------------------

func TestDebugLogger_DisabledNoOp(t *testing.T) {
	dl := freshLogger(10)
	dl.enabled.Store(false)

	dl.Log(LogLevelInfo, LogCategoryCommand, "test", "should not appear", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries when disabled, got %d", len(entries))
	}
}

func TestDebugLogger_SetEnabledLogsItself(t *testing.T) {
	dl := freshLogger(10)
	dl.enabled.Store(false)

	dl.SetEnabled(true)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 1 {
		t.Fatalf("expected 1 lifecycle entry, got %d", len(entries))
	}
	if !strings.Contains(entries[0].Message, "enabled") {
		t.Errorf("expected 'enabled' in message, got %q", entries[0].Message)
	}
	if entries[0].Category != LogCategoryLifecycle {
		t.Errorf("expected lifecycle category, got %s", entries[0].Category)
	}
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

func TestDebugLogger_FilterByLevel(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "info msg", LogDetails{}, -1)
	dl.forceLog(LogLevelError, LogCategoryCommand, "b", "error msg", LogDetails{}, -1)
	dl.forceLog(LogLevelWarn, LogCategoryCommand, "c", "warn msg", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Level: "error"})
	if len(entries) != 1 {
		t.Fatalf("expected 1 error entry, got %d", len(entries))
	}
	if entries[0].Level != LogLevelError {
		t.Errorf("expected error level, got %s", entries[0].Level)
	}
}

func TestDebugLogger_FilterByCategory(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "cmd", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryMethod, "b", "method", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "c", "cmd2", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Category: "method"})
	if len(entries) != 1 {
		t.Fatalf("expected 1 method entry, got %d", len(entries))
	}
}

func TestDebugLogger_FilterBySource(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryMethod, "GitService.Commit", "commit", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryMethod, "LFSService.Track", "track", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Source: "gitservice"}) // case-insensitive
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry matching 'gitservice', got %d", len(entries))
	}
}

func TestDebugLogger_FilterBySearch(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "git commit -m fix", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "b", "git push origin", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Search: "push"})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry matching 'push', got %d", len(entries))
	}
}

func TestDebugLogger_FilterBySince(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "old", LogDetails{}, -1)
	time.Sleep(10 * time.Millisecond)
	since := time.Now().UnixMilli()
	time.Sleep(10 * time.Millisecond)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "b", "new", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Since: since})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry since %d, got %d", since, len(entries))
	}
	if entries[0].Message != "new" {
		t.Errorf("expected 'new', got %q", entries[0].Message)
	}
}

func TestDebugLogger_FilterPagination(t *testing.T) {
	dl := freshLogger(100)
	for i := 0; i < 10; i++ {
		dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", fmt.Sprintf("msg-%d", i), LogDetails{}, -1)
	}

	page1 := dl.GetEntries(LogFilter{Limit: 3, Offset: 0})
	page2 := dl.GetEntries(LogFilter{Limit: 3, Offset: 3})

	if len(page1) != 3 {
		t.Fatalf("expected 3 entries in page 1, got %d", len(page1))
	}
	if len(page2) != 3 {
		t.Fatalf("expected 3 entries in page 2, got %d", len(page2))
	}
	if page1[0].Message == page2[0].Message {
		t.Error("page 1 and page 2 should not start with the same entry")
	}
}

func TestDebugLogger_FilterOffsetBeyondTotal(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "only", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{Offset: 100})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries with offset beyond total, got %d", len(entries))
	}
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

func TestDebugLogger_Clear(t *testing.T) {
	dl := freshLogger(100)
	for i := 0; i < 5; i++ {
		dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "msg", LogDetails{}, -1)
	}

	dl.Clear()

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}

	stats := dl.GetStats()
	if stats.TotalCommands != 0 || stats.TotalErrors != 0 || stats.TotalMethods != 0 {
		t.Error("counters should be 0 after clear")
	}
}

// ---------------------------------------------------------------------------
// Stats / counters
// ---------------------------------------------------------------------------

func TestDebugLogger_Stats(t *testing.T) {
	dl := freshLogger(100)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "cmd1", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "b", "cmd2", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryMethod, "c", "method1", LogDetails{}, -1)
	dl.forceLog(LogLevelError, LogCategoryCommand, "d", "err1", LogDetails{}, -1)

	stats := dl.GetStats()
	if stats.TotalEntries != 4 {
		t.Errorf("expected 4 total entries, got %d", stats.TotalEntries)
	}
	if stats.TotalCommands != 3 { // 2 info commands + 1 error command
		t.Errorf("expected 3 total commands, got %d", stats.TotalCommands)
	}
	if stats.TotalMethods != 1 {
		t.Errorf("expected 1 total method, got %d", stats.TotalMethods)
	}
	if stats.TotalErrors != 1 {
		t.Errorf("expected 1 total error, got %d", stats.TotalErrors)
	}
	if stats.BufferUsage != 4 { // 4/100 = 4%
		t.Errorf("expected 4%% buffer usage, got %d%%", stats.BufferUsage)
	}
}

// ---------------------------------------------------------------------------
// GetEntryByID
// ---------------------------------------------------------------------------

func TestDebugLogger_GetEntryByID(t *testing.T) {
	dl := freshLogger(10)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "first", LogDetails{}, -1)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "b", "second", LogDetails{}, -1)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) < 2 {
		t.Fatal("expected at least 2 entries")
	}

	found := dl.GetEntryByID(entries[1].ID)
	if found == nil {
		t.Fatal("expected to find entry by ID")
	}
	if found.Message != "second" {
		t.Errorf("expected 'second', got %q", found.Message)
	}

	notFound := dl.GetEntryByID(99999)
	if notFound != nil {
		t.Error("expected nil for non-existent ID")
	}
}

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

func TestSanitize_RedactsGitHubTokens(t *testing.T) {
	tests := []struct {
		input    string
		contains string
	}{
		{"token ghp_abcDEF123456789xyzABC", "***"},
		{"token gho_abc123xyz", "***"},
		{"token glpat-abc-123_xyz", "***"},
		{"https://user:mytoken@github.com/repo", "***"},
		{"token github_pat_abc123DEF", "***"},
	}

	for _, tt := range tests {
		result := sanitize(tt.input)
		if !strings.Contains(result, tt.contains) {
			t.Errorf("sanitize(%q) = %q, expected to contain %q", tt.input, result, tt.contains)
		}
		// Should NOT contain the original sensitive part
		if tt.input == result {
			t.Errorf("sanitize(%q) did not redact anything", tt.input)
		}
	}
}

func TestSanitize_LeavesNonSensitiveAlone(t *testing.T) {
	safe := "git commit -m 'fix bug'"
	if sanitize(safe) != safe {
		t.Errorf("sanitize should not modify non-sensitive input")
	}
}

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

func TestTruncate(t *testing.T) {
	short := "hello"
	if truncate(short, 100) != short {
		t.Error("short strings should not be truncated")
	}

	long := strings.Repeat("x", 300)
	result := truncate(long, 100)
	if len(result) > 120 { // 100 + "…[truncated]"
		t.Errorf("truncated string too long: %d", len(result))
	}
	if !strings.HasSuffix(result, "…[truncated]") {
		t.Error("truncated string should end with marker")
	}
}

// ---------------------------------------------------------------------------
// Thread safety
// ---------------------------------------------------------------------------

func TestDebugLogger_ConcurrentWrites(t *testing.T) {
	dl := freshLogger(100)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			dl.forceLog(LogLevelInfo, LogCategoryCommand, "goroutine",
				fmt.Sprintf("msg-%d", n), LogDetails{}, int64(n))
		}(i)
	}
	wg.Wait()

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 50 {
		t.Errorf("expected 50 entries from concurrent writes, got %d", len(entries))
	}
}

func TestDebugLogger_ConcurrentReadWrite(t *testing.T) {
	dl := freshLogger(50)

	var wg sync.WaitGroup

	// Writers
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			dl.forceLog(LogLevelInfo, LogCategoryCommand, "w",
				fmt.Sprintf("msg-%d", n), LogDetails{}, int64(n))
		}(i)
	}

	// Readers (concurrent with writes)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = dl.GetEntries(LogFilter{})
			_ = dl.GetStats()
		}()
	}

	wg.Wait()
	// If we get here without a race detector panic, the test passes.
}

// ---------------------------------------------------------------------------
// LogMethod helper
// ---------------------------------------------------------------------------

func TestLogMethod_NoOpWhenDisabled(t *testing.T) {
	dl := freshLogger(10)
	dl.enabled.Store(false)

	withTestGlobalLogger(t, dl)

	done := LogMethod("TestService.Method", nil)
	done(nil, nil)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries when disabled, got %d", len(entries))
	}
}

func TestLogMethod_LogsCallAndCompletion(t *testing.T) {
	dl := freshLogger(10)

	withTestGlobalLogger(t, dl)

	done := LogMethod("GitService.Commit", map[string]interface{}{"msg": "fix"})
	time.Sleep(5 * time.Millisecond) // small delay so duration > 0
	result := OperationResult{Success: true, Message: "ok"}
	done(result, nil)

	entries := dl.GetEntries(LogFilter{})
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries (call + completion), got %d", len(entries))
	}
	if !strings.Contains(entries[0].Message, "→") {
		t.Errorf("first entry should be call marker, got %q", entries[0].Message)
	}
	if !strings.Contains(entries[1].Message, "←") {
		t.Errorf("second entry should be completion marker, got %q", entries[1].Message)
	}
	if entries[1].Duration < 0 {
		t.Errorf("expected non-negative duration, got %d", entries[1].Duration)
	}
}

func TestLogMethod_DetectsOperationResultFailure(t *testing.T) {
	dl := freshLogger(10)

	withTestGlobalLogger(t, dl)

	done := LogMethod("GitService.Push", nil)
	result := OperationResult{Success: false, Error: "rejected"}
	done(result, nil)

	entries := dl.GetEntries(LogFilter{Level: "error"})
	if len(entries) != 1 {
		t.Fatalf("expected 1 error entry for failed OperationResult, got %d", len(entries))
	}
}

// ---------------------------------------------------------------------------
// Export (basic — we just test the path generation, not disk write in CI)
// ---------------------------------------------------------------------------

func TestDebugLogger_ExportCreatesFile(t *testing.T) {
	dl := freshLogger(10)
	dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "export test", LogDetails{}, -1)

	path, err := dl.Export()
	if err != nil {
		t.Fatalf("Export() error: %v", err)
	}
	if path == "" {
		t.Fatal("Export() returned empty path")
	}
	if !strings.HasSuffix(path, ".json") {
		t.Errorf("expected .json suffix, got %q", path)
	}
	// Clean up
	_ = removeExportFile(path)
}

func removeExportFile(path string) error {
	return nil // intentionally no-op in test; real cleanup in CleanOldExports
}

// ---------------------------------------------------------------------------
// summariseOutput
// ---------------------------------------------------------------------------

func TestSummariseOutput_OperationResult(t *testing.T) {
	op := OperationResult{Success: true, Message: "ok", Error: ""}
	summary := summariseOutput(op)

	m, ok := summary.(map[string]interface{})
	if !ok {
		t.Fatal("expected map from summariseOutput for OperationResult")
	}
	if m["success"] != true {
		t.Error("expected success=true")
	}
}

func TestSummariseOutput_Nil(t *testing.T) {
	if summariseOutput(nil) != nil {
		t.Error("expected nil for nil input")
	}
}

func TestSummariseOutput_OtherType(t *testing.T) {
	result := summariseOutput("just a string")
	s, ok := result.(string)
	if !ok {
		t.Fatal("expected string type name")
	}
	if s != "string" {
		t.Errorf("expected 'string', got %q", s)
	}
}
