package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestGetAppSettings_Default(t *testing.T) {
	svc := NewSettingsService()
	// Override settings dir to temp location
	tmpDir, err := os.MkdirTemp("", "settings-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)
	svc.settingsDir = tmpDir
	svc.legacyDir = tmpDir

	settings := svc.GetAppSettings()

	// Should return defaults when no settings file exists
	if settings.Theme != "dark" {
		t.Errorf("Expected default theme 'dark', got '%s'", settings.Theme)
	}
	if settings.LastRepoPath != "" {
		t.Errorf("Expected empty LastRepoPath, got '%s'", settings.LastRepoPath)
	}
	if settings.DeveloperModeEnabled {
		t.Error("Expected DeveloperModeEnabled to default to false")
	}
	if settings.TimelineHeight != 160 {
		t.Errorf("Expected default Timeline height 160, got %d", settings.TimelineHeight)
	}
}

func TestSaveAndGetAppSettings(t *testing.T) {
	svc := NewSettingsService()
	// Override settings dir to temp location
	tmpDir, err := os.MkdirTemp("", "settings-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)
	svc.settingsDir = tmpDir
	svc.legacyDir = tmpDir

	// Save settings
	settings := AppSettings{
		Theme:                "light",
		LastRepoPath:         "/path/to/repo",
		DeveloperModeEnabled: true,
		TimelineHeight:       224,
	}
	err = svc.SaveAppSettings(settings)
	if err != nil {
		t.Errorf("Failed to save settings: %v", err)
	}

	// Verify file was created
	settingsPath := filepath.Join(tmpDir, "settings.json")
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		t.Errorf("Settings file was not created")
	}

	// Load settings back
	loadedSettings := svc.GetAppSettings()
	if loadedSettings.Theme != "light" {
		t.Errorf("Expected theme 'light', got '%s'", loadedSettings.Theme)
	}
	if loadedSettings.LastRepoPath != "/path/to/repo" {
		t.Errorf("Expected LastRepoPath '/path/to/repo', got '%s'", loadedSettings.LastRepoPath)
	}
	if !loadedSettings.DeveloperModeEnabled {
		t.Error("Expected DeveloperModeEnabled to round-trip as true")
	}
	if loadedSettings.TimelineHeight != 224 {
		t.Errorf("Expected Timeline height to round-trip as 224, got %d", loadedSettings.TimelineHeight)
	}
}

func TestGetAppSettings_TimelineHeightFallback(t *testing.T) {
	for _, data := range []string{`{}`, `{"timelineHeight":0}`, `{"timelineHeight":-80}`, `{"timelineHeight":900}`} {
		t.Run(data, func(t *testing.T) {
			svc := NewSettingsService()
			svc.settingsDir = t.TempDir()
			svc.legacyDir = svc.settingsDir
			if err := os.WriteFile(filepath.Join(svc.settingsDir, "settings.json"), []byte(data), 0o644); err != nil {
				t.Fatal(err)
			}
			if height := svc.GetAppSettings().TimelineHeight; height != 160 {
				t.Fatalf("Expected Timeline height 160, got %d", height)
			}
		})
	}
}

func TestGetAppSettings_MissingDeveloperModeDefaultsFalse(t *testing.T) {
	svc := NewSettingsService()
	tmpDir, err := os.MkdirTemp("", "settings-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)
	svc.settingsDir = tmpDir
	svc.legacyDir = tmpDir

	settingsPath := filepath.Join(tmpDir, "settings.json")
	if err := os.WriteFile(settingsPath, []byte(`{"theme":"light","lastRepoPath":"/tmp/repo"}`), 0o644); err != nil {
		t.Fatalf("Failed to seed settings file: %v", err)
	}

	settings := svc.GetAppSettings()
	if settings.DeveloperModeEnabled {
		t.Error("Expected DeveloperModeEnabled to default to false when the field is missing")
	}
}

func TestGetUserProfile_FromRepo(t *testing.T) {
	// Create temp git repo
	tmpDir, err := os.MkdirTemp("", "profile-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Set local config
	cmd = exec.Command("git", "config", "user.name", "Local User")
	cmd.Dir = tmpDir
	cmd.Run()

	cmd = exec.Command("git", "config", "user.email", "local@example.com")
	cmd.Dir = tmpDir
	cmd.Run()

	svc := NewSettingsService()
	profile := svc.GetUserProfile(tmpDir)

	if profile.Name != "Local User" {
		t.Errorf("Expected name 'Local User', got '%s'", profile.Name)
	}
	if profile.Email != "local@example.com" {
		t.Errorf("Expected email 'local@example.com', got '%s'", profile.Email)
	}
}

func TestSetUserProfile_Local(t *testing.T) {
	// Create temp git repo
	tmpDir, err := os.MkdirTemp("", "profile-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	svc := NewSettingsService()
	profile := UserProfile{
		Name:  "New User",
		Email: "new@example.com",
	}

	result := svc.SetUserProfile(tmpDir, profile, false)
	if !result.Success {
		t.Errorf("Expected Success to be true, got error: %s", result.Error)
	}

	// Verify the profile was set
	loadedProfile := svc.GetUserProfile(tmpDir)
	if loadedProfile.Name != "New User" {
		t.Errorf("Expected name 'New User', got '%s'", loadedProfile.Name)
	}
	if loadedProfile.Email != "new@example.com" {
		t.Errorf("Expected email 'new@example.com', got '%s'", loadedProfile.Email)
	}
}

func TestSetUserProfile_PartialUpdate(t *testing.T) {
	// Create temp git repo
	tmpDir, err := os.MkdirTemp("", "profile-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Set initial config
	cmd = exec.Command("git", "config", "user.name", "Original Name")
	cmd.Dir = tmpDir
	cmd.Run()

	cmd = exec.Command("git", "config", "user.email", "original@example.com")
	cmd.Dir = tmpDir
	cmd.Run()

	svc := NewSettingsService()

	// Update only the name
	profile := UserProfile{
		Name:  "Updated Name",
		Email: "", // Empty should not update
	}

	result := svc.SetUserProfile(tmpDir, profile, false)
	if !result.Success {
		t.Errorf("Expected Success to be true, got error: %s", result.Error)
	}

	// Verify only name was updated
	loadedProfile := svc.GetUserProfile(tmpDir)
	if loadedProfile.Name != "Updated Name" {
		t.Errorf("Expected name 'Updated Name', got '%s'", loadedProfile.Name)
	}
	// Email should remain unchanged
	if loadedProfile.Email != "original@example.com" {
		t.Errorf("Expected email 'original@example.com', got '%s'", loadedProfile.Email)
	}
}

func TestGetUserProfile_Global(t *testing.T) {
	// Isolate global git config for this test.
	tmpHome, err := os.MkdirTemp("", "git-home-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp home dir: %v", err)
	}
	defer os.RemoveAll(tmpHome)

	t.Setenv("HOME", tmpHome)
	t.Setenv("USERPROFILE", tmpHome)
	t.Setenv("HOMEDRIVE", "")
	t.Setenv("HOMEPATH", "")

	svc := NewSettingsService()

	setResult := svc.SetUserProfile("", UserProfile{
		Name:  "Global User",
		Email: "global@example.com",
	}, true)
	if !setResult.Success {
		t.Fatalf("Expected SetUserProfile to succeed, got error: %s", setResult.Error)
	}

	profile := svc.GetUserProfile("")
	if profile.Name != "Global User" {
		t.Errorf("Expected name 'Global User', got '%s'", profile.Name)
	}
	if profile.Email != "global@example.com" {
		t.Errorf("Expected email 'global@example.com', got '%s'", profile.Email)
	}
}
