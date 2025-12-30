package services

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewFileSystemService(t *testing.T) {
	svc := NewFileSystemService()
	if svc == nil {
		t.Fatal("Expected service to be non-nil")
	}
}

func TestListDirectory_EmptyPath(t *testing.T) {
	svc := NewFileSystemService()

	result := svc.ListDirectory("")

	if result.Error == "" {
		t.Error("Expected error for empty path")
	}
	if len(result.Entries) != 0 {
		t.Errorf("Expected no entries, got %d", len(result.Entries))
	}
}

func TestListDirectory_NonExistentPath(t *testing.T) {
	svc := NewFileSystemService()

	result := svc.ListDirectory("/nonexistent/path/that/does/not/exist")

	if result.Error == "" {
		t.Error("Expected error for non-existent path")
	}
}

func TestListDirectory_FileInsteadOfDirectory(t *testing.T) {
	tmpFile, err := os.CreateTemp("", "test-file-*")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.Close()

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpFile.Name())

	if result.Error == "" {
		t.Error("Expected error when path is a file, not directory")
	}
}

func TestListDirectory_ValidDirectory(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test-dir-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	os.WriteFile(filepath.Join(tmpDir, "file1.txt"), []byte("content"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "file2.go"), []byte("package main"), 0644)
	os.Mkdir(filepath.Join(tmpDir, "subdir"), 0755)

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpDir)

	if result.Error != "" {
		t.Errorf("Unexpected error: %s", result.Error)
	}
	if len(result.Entries) != 3 {
		t.Errorf("Expected 3 entries, got %d", len(result.Entries))
	}

	// Directories come first
	if len(result.Entries) >= 1 && !result.Entries[0].IsDirectory {
		t.Error("Expected directories to be listed first")
	}
}

func TestListDirectory_HiddenFilesExcluded(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test-hidden-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	os.WriteFile(filepath.Join(tmpDir, ".hidden"), []byte("hidden"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "visible.txt"), []byte("visible"), 0644)

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpDir)

	if result.Error != "" {
		t.Errorf("Unexpected error: %s", result.Error)
	}
	if len(result.Entries) != 1 {
		t.Errorf("Expected 1 entry (hidden excluded), got %d", len(result.Entries))
	}
	if len(result.Entries) > 0 && result.Entries[0].Name == ".hidden" {
		t.Error("Hidden files should be excluded")
	}
}

func TestListDirectory_FileExtension(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test-ext-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	os.WriteFile(filepath.Join(tmpDir, "test.json"), []byte("{}"), 0644)

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpDir)

	if result.Error != "" {
		t.Errorf("Unexpected error: %s", result.Error)
	}
	if len(result.Entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(result.Entries))
	}
	if result.Entries[0].Extension != "json" {
		t.Errorf("Expected extension 'json', got '%s'", result.Entries[0].Extension)
	}
}

func TestListDirectory_SortedAlphabetically(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test-sort-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	os.WriteFile(filepath.Join(tmpDir, "zebra.txt"), []byte("z"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "Apple.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "banana.txt"), []byte("b"), 0644)

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpDir)

	if result.Error != "" {
		t.Errorf("Unexpected error: %s", result.Error)
	}
	if len(result.Entries) != 3 {
		t.Fatalf("Expected 3 entries, got %d", len(result.Entries))
	}

	// Case-insensitive alphabetical order
	expected := []string{"Apple.txt", "banana.txt", "zebra.txt"}
	for i, name := range expected {
		if result.Entries[i].Name != name {
			t.Errorf("Expected entry %d to be '%s', got '%s'", i, name, result.Entries[i].Name)
		}
	}
}

func TestOpenFile_EmptyPath(t *testing.T) {
	svc := NewFileSystemService()

	result := svc.OpenFile("")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
	if result.Error == "" {
		t.Error("Expected error message")
	}
}

func TestOpenFile_NonExistentFile(t *testing.T) {
	svc := NewFileSystemService()

	result := svc.OpenFile("/nonexistent/file/path")

	if result.Success {
		t.Error("Expected failure for non-existent file")
	}
}

func TestGetParentDirectory(t *testing.T) {
	svc := NewFileSystemService()

	tests := []struct {
		input    string
		expected string
	}{
		{"/home/user/file.txt", "/home/user"},
		{"/home/user/", "/home/user"},
		{"/", "/"},
		{"", ""},
	}

	for _, tt := range tests {
		result := svc.GetParentDirectory(tt.input)
		if result != tt.expected {
			t.Errorf("GetParentDirectory(%q) = %q, expected %q", tt.input, result, tt.expected)
		}
	}
}

func TestListDirectory_FileSize(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "test-size-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	content := "hello world" // 11 bytes
	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte(content), 0644)

	svc := NewFileSystemService()
	result := svc.ListDirectory(tmpDir)

	if result.Error != "" {
		t.Errorf("Unexpected error: %s", result.Error)
	}
	if len(result.Entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(result.Entries))
	}
	if result.Entries[0].Size != 11 {
		t.Errorf("Expected size 11, got %d", result.Entries[0].Size)
	}
}
