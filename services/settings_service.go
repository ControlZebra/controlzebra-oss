package services

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// SettingsService manages app and user settings
type SettingsService struct {
	runner      *CommandRunner
	settingsDir string
}

// NewSettingsService creates a new SettingsService
func NewSettingsService() *SettingsService {
	// Get user config directory
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	settingsDir := filepath.Join(configDir, "rewind-logic")

	return &SettingsService{
		runner:      NewCommandRunner(),
		settingsDir: settingsDir,
	}
}

// AppSettings contains application preferences
type AppSettings struct {
	Theme        string `json:"theme"`        // "dark", "light", "system"
	LastRepoPath string `json:"lastRepoPath"` // Last opened repository path
}

// UserProfile contains git user configuration
type UserProfile struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// GetAppSettings returns the current app settings
func (s *SettingsService) GetAppSettings() AppSettings {
	settings := AppSettings{
		Theme: "dark", // default
	}

	settingsPath := filepath.Join(s.settingsDir, "settings.json")
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return settings
	}

	_ = json.Unmarshal(data, &settings)
	return settings
}

// SaveAppSettings saves the app settings
func (s *SettingsService) SaveAppSettings(settings AppSettings) error {
	// Ensure settings directory exists
	if err := os.MkdirAll(s.settingsDir, 0755); err != nil {
		return err
	}

	settingsPath := filepath.Join(s.settingsDir, "settings.json")
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(settingsPath, data, 0644)
}

// GetUserProfile returns the git user config (global or for a specific repo)
func (s *SettingsService) GetUserProfile(repoPath string) UserProfile {
	profile := UserProfile{}

	// If repoPath is provided, try to get local config first
	workDir := "."
	if repoPath != "" {
		workDir = repoPath
	}

	// Get user name
	nameResult := s.runner.RunGit(workDir, "config", "user.name")
	if nameResult.Success {
		profile.Name = trimNewline(nameResult.Stdout)
	}

	// Get user email
	emailResult := s.runner.RunGit(workDir, "config", "user.email")
	if emailResult.Success {
		profile.Email = trimNewline(emailResult.Stdout)
	}

	return profile
}

// SetUserProfile sets the git user config
func (s *SettingsService) SetUserProfile(repoPath string, profile UserProfile, global bool) OperationResult {
	workDir := "."
	if repoPath != "" {
		workDir = repoPath
	}

	args := []string{"config"}
	if global {
		args = append(args, "--global")
	}

	// Set user name
	if profile.Name != "" {
		nameArgs := append(args, "user.name", profile.Name)
		result := s.runner.RunGit(workDir, nameArgs...)
		if !result.Success {
			return OperationResult{
				Success: false,
				Error:   "Failed to set user name: " + result.Stderr,
			}
		}
	}

	// Set user email
	if profile.Email != "" {
		emailArgs := append(args, "user.email", profile.Email)
		result := s.runner.RunGit(workDir, emailArgs...)
		if !result.Success {
			return OperationResult{
				Success: false,
				Error:   "Failed to set user email: " + result.Stderr,
			}
		}
	}

	return OperationResult{
		Success: true,
		Message: "Profile updated successfully",
	}
}
