package services

import (
	"testing"
)

func TestNewDebugService(t *testing.T) {
	svc := NewDebugService()
	if svc == nil {
		t.Fatal("expected non-nil DebugService")
	}
	if svc.logger == nil {
		t.Fatal("expected non-nil logger in DebugService")
	}
}

func TestDebugService_EnableDisable(t *testing.T) {
	svc := NewDebugService()
	// Ensure clean state
	svc.logger.enabled.Store(false)
	svc.logger.Clear()

	if svc.IsEnabled() {
		t.Error("expected disabled by default")
	}

	svc.SetEnabled(true)
	if !svc.IsEnabled() {
		t.Error("expected enabled after SetEnabled(true)")
	}

	svc.SetEnabled(false)
	if svc.IsEnabled() {
		t.Error("expected disabled after SetEnabled(false)")
	}
}

func TestDebugService_GetLogs(t *testing.T) {
	dl := freshLogger(50)
	svc := &DebugService{logger: dl}

	dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "cmd1", LogDetails{}, 10)
	dl.forceLog(LogLevelError, LogCategoryMethod, "test", "err1", LogDetails{}, 20)

	all := svc.GetLogs(LogFilter{})
	if len(all) != 2 {
		t.Fatalf("expected 2 logs, got %d", len(all))
	}

	errors := svc.GetLogs(LogFilter{Level: "error"})
	if len(errors) != 1 {
		t.Fatalf("expected 1 error log, got %d", len(errors))
	}
}

func TestDebugService_ClearLogs(t *testing.T) {
	dl := freshLogger(50)
	svc := &DebugService{logger: dl}

	dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "msg", LogDetails{}, -1)
	svc.ClearLogs()

	all := svc.GetLogs(LogFilter{})
	if len(all) != 0 {
		t.Fatalf("expected 0 logs after clear, got %d", len(all))
	}
}

func TestDebugService_GetStats(t *testing.T) {
	dl := freshLogger(50)
	svc := &DebugService{logger: dl}

	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "cmd", LogDetails{}, -1)
	dl.forceLog(LogLevelError, LogCategoryMethod, "b", "err", LogDetails{}, -1)

	stats := svc.GetStats()
	if stats.TotalEntries != 2 {
		t.Errorf("expected 2 total entries, got %d", stats.TotalEntries)
	}
	if stats.TotalCommands != 1 {
		t.Errorf("expected 1 command, got %d", stats.TotalCommands)
	}
	if stats.TotalErrors != 1 {
		t.Errorf("expected 1 error, got %d", stats.TotalErrors)
	}
}

func TestDebugService_GetLogByID(t *testing.T) {
	dl := freshLogger(50)
	svc := &DebugService{logger: dl}

	dl.forceLog(LogLevelInfo, LogCategoryCommand, "a", "target", LogDetails{}, -1)
	all := svc.GetLogs(LogFilter{})
	if len(all) == 0 {
		t.Fatal("expected at least 1 entry")
	}

	entry := svc.GetLogByID(all[0].ID)
	if entry == nil {
		t.Fatal("expected non-nil entry")
	}
	if entry.Message != "target" {
		t.Errorf("expected 'target', got %q", entry.Message)
	}

	missing := svc.GetLogByID(99999)
	if missing != nil {
		t.Error("expected nil for missing ID")
	}
}

func TestDebugService_ExportLogs(t *testing.T) {
	dl := freshLogger(50)
	svc := &DebugService{logger: dl}

	dl.forceLog(LogLevelInfo, LogCategoryCommand, "test", "export entry", LogDetails{}, -1)

	path := svc.ExportLogs()
	if path == "" {
		t.Fatal("expected non-empty export path")
	}
}
