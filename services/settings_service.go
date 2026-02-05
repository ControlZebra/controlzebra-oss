package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// SettingsService manages app and user settings
type SettingsService struct {
	runner      *CommandRunner
	settingsDir string
	app         *application.App
}

// NewSettingsService creates a new SettingsService
func NewSettingsService() *SettingsService {
	// Get user config directory
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	settingsDir := filepath.Join(configDir, "control-zebra")

	return &SettingsService{
		runner:      NewCommandRunner(),
		settingsDir: settingsDir,
	}
}

// SetApp sets the application reference (called after app initialization)
func (s *SettingsService) SetApp(app *application.App) {
	s.app = app
}

// AppSettings contains application preferences
type AppSettings struct {
	Theme         string   `json:"theme"`         // "dark", "light", "system"
	LastRepoPath  string   `json:"lastRepoPath"`  // Last opened repository path
	RecentFolders []string `json:"recentFolders"` // Recently opened folders (max 10)
}

// UserProfile contains git user configuration
type UserProfile struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// CustomLFSGroup represents a user-defined LFS extension group
type CustomLFSGroup struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Color       string   `json:"color"`       // Tailwind color class like "text-cyan-400"
	Extensions  []string `json:"extensions"`  // e.g., [".bin", ".dat"]
	Description string   `json:"description"` // Optional description
}

// CustomLFSGroupsData contains all custom LFS groups
type CustomLFSGroupsData struct {
	Groups []CustomLFSGroup `json:"groups"`
}

// GetCustomLFSGroups returns all custom LFS groups
func (s *SettingsService) GetCustomLFSGroups() CustomLFSGroupsData {
	data := CustomLFSGroupsData{
		Groups: []CustomLFSGroup{},
	}

	groupsPath := filepath.Join(s.settingsDir, "lfs-groups.json")
	fileData, err := os.ReadFile(groupsPath)
	if err != nil {
		return data
	}

	_ = json.Unmarshal(fileData, &data)
	return data
}

// SaveCustomLFSGroups saves all custom LFS groups
func (s *SettingsService) SaveCustomLFSGroups(data CustomLFSGroupsData) error {
	// Ensure settings directory exists
	if err := os.MkdirAll(s.settingsDir, 0755); err != nil {
		return err
	}

	groupsPath := filepath.Join(s.settingsDir, "lfs-groups.json")
	fileData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(groupsPath, fileData, 0644)
}

// validateCustomLFSGroup validates a custom LFS group
func validateCustomLFSGroup(group CustomLFSGroup) error {
	if strings.TrimSpace(group.ID) == "" {
		return fmt.Errorf("group ID is required")
	}
	if strings.TrimSpace(group.Name) == "" {
		return fmt.Errorf("group name is required")
	}
	if len(group.Extensions) == 0 {
		return fmt.Errorf("at least one extension is required")
	}
	// Validate extensions format
	for _, ext := range group.Extensions {
		if !strings.HasPrefix(ext, ".") {
			return fmt.Errorf("extension '%s' must start with a dot", ext)
		}
	}
	return nil
}

// AddCustomLFSGroup adds a new custom LFS group
func (s *SettingsService) AddCustomLFSGroup(group CustomLFSGroup) OperationResult {
	// Validate input
	if err := validateCustomLFSGroup(group); err != nil {
		return OperationResult{
			Success: false,
			Error:   err.Error(),
		}
	}

	data := s.GetCustomLFSGroups()

	// Check for duplicate ID
	for _, g := range data.Groups {
		if g.ID == group.ID {
			return OperationResult{
				Success: false,
				Error:   "Group with this ID already exists",
			}
		}
	}

	data.Groups = append(data.Groups, group)
	if err := s.SaveCustomLFSGroups(data); err != nil {
		return OperationResult{
			Success: false,
			Error:   "Failed to save groups: " + err.Error(),
		}
	}

	return OperationResult{
		Success: true,
		Message: "Group added successfully",
	}
}

// UpdateCustomLFSGroup updates an existing custom LFS group
func (s *SettingsService) UpdateCustomLFSGroup(group CustomLFSGroup) OperationResult {
	// Validate input
	if err := validateCustomLFSGroup(group); err != nil {
		return OperationResult{
			Success: false,
			Error:   err.Error(),
		}
	}

	data := s.GetCustomLFSGroups()

	found := false
	for i, g := range data.Groups {
		if g.ID == group.ID {
			data.Groups[i] = group
			found = true
			break
		}
	}

	if !found {
		return OperationResult{
			Success: false,
			Error:   "Group not found",
		}
	}

	if err := s.SaveCustomLFSGroups(data); err != nil {
		return OperationResult{
			Success: false,
			Error:   "Failed to save groups: " + err.Error(),
		}
	}

	return OperationResult{
		Success: true,
		Message: "Group updated successfully",
	}
}

// DeleteCustomLFSGroup deletes a custom LFS group by ID
func (s *SettingsService) DeleteCustomLFSGroup(groupID string) OperationResult {
	data := s.GetCustomLFSGroups()

	found := false
	newGroups := []CustomLFSGroup{}
	for _, g := range data.Groups {
		if g.ID == groupID {
			found = true
		} else {
			newGroups = append(newGroups, g)
		}
	}

	if !found {
		return OperationResult{
			Success: false,
			Error:   "Group not found",
		}
	}

	data.Groups = newGroups
	if err := s.SaveCustomLFSGroups(data); err != nil {
		return OperationResult{
			Success: false,
			Error:   "Failed to save groups: " + err.Error(),
		}
	}

	return OperationResult{
		Success: true,
		Message: "Group deleted successfully",
	}
}

// ExportLFSGroupsResult contains the result of an export operation
type ExportLFSGroupsResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ExportCustomLFSGroups exports custom LFS groups to a JSON file
func (s *SettingsService) ExportCustomLFSGroups() ExportLFSGroupsResult {
	if s.app == nil {
		return ExportLFSGroupsResult{
			Success: false,
			Error:   "Application not initialized",
		}
	}

	// Open save dialog
	path, err := s.app.Dialog.SaveFile().
		AddFilter("JSON Files", "*.json").
		SetFilename("lfs-groups.json").
		PromptForSingleSelection()

	if err != nil || path == "" {
		return ExportLFSGroupsResult{
			Success: false,
			Error:   "Export cancelled",
		}
	}

	// Get current groups
	data := s.GetCustomLFSGroups()
	fileData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return ExportLFSGroupsResult{
			Success: false,
			Error:   "Failed to serialize groups: " + err.Error(),
		}
	}

	// Write to file
	if err := os.WriteFile(path, fileData, 0644); err != nil {
		return ExportLFSGroupsResult{
			Success: false,
			Error:   "Failed to write file: " + err.Error(),
		}
	}

	return ExportLFSGroupsResult{
		Success: true,
		Path:    path,
	}
}

// ImportLFSGroupsResult contains the result of an import operation
type ImportLFSGroupsResult struct {
	Success       bool   `json:"success"`
	ImportedCount int    `json:"importedCount"`
	Error         string `json:"error,omitempty"`
}

// ImportCustomLFSGroups imports custom LFS groups from a JSON file
func (s *SettingsService) ImportCustomLFSGroups(merge bool) ImportLFSGroupsResult {
	if s.app == nil {
		return ImportLFSGroupsResult{
			Success: false,
			Error:   "Application not initialized",
		}
	}

	// Open file dialog
	path, err := s.app.Dialog.OpenFile().
		AddFilter("JSON Files", "*.json").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		PromptForSingleSelection()

	if err != nil || path == "" {
		return ImportLFSGroupsResult{
			Success: false,
			Error:   "Import cancelled",
		}
	}

	// Read file
	fileData, err := os.ReadFile(path)
	if err != nil {
		return ImportLFSGroupsResult{
			Success: false,
			Error:   "Failed to read file: " + err.Error(),
		}
	}

	// Parse JSON
	var importedData CustomLFSGroupsData
	if err := json.Unmarshal(fileData, &importedData); err != nil {
		return ImportLFSGroupsResult{
			Success: false,
			Error:   "Invalid JSON format: " + err.Error(),
		}
	}

	if merge {
		// Merge with existing groups
		existingData := s.GetCustomLFSGroups()
		existingIDs := make(map[string]bool)
		for _, g := range existingData.Groups {
			existingIDs[g.ID] = true
		}

		imported := 0
		for _, g := range importedData.Groups {
			if !existingIDs[g.ID] {
				existingData.Groups = append(existingData.Groups, g)
				imported++
			}
		}

		if err := s.SaveCustomLFSGroups(existingData); err != nil {
			return ImportLFSGroupsResult{
				Success: false,
				Error:   "Failed to save merged groups: " + err.Error(),
			}
		}

		return ImportLFSGroupsResult{
			Success:       true,
			ImportedCount: imported,
		}
	}

	// Replace all groups
	if err := s.SaveCustomLFSGroups(importedData); err != nil {
		return ImportLFSGroupsResult{
			Success: false,
			Error:   "Failed to save groups: " + err.Error(),
		}
	}

	return ImportLFSGroupsResult{
		Success:       true,
		ImportedCount: len(importedData.Groups),
	}
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

// maxRecentFolders is the maximum number of recent folders to keep
const maxRecentFolders = 10

// GetRecentFolders returns the list of recently opened folders
func (s *SettingsService) GetRecentFolders() []string {
	settings := s.GetAppSettings()
	if settings.RecentFolders == nil {
		return []string{}
	}
	return settings.RecentFolders
}

// AddRecentFolder adds a folder to the recent folders list
// It moves the folder to the front if it already exists
func (s *SettingsService) AddRecentFolder(folderPath string) error {
	if folderPath == "" {
		return nil
	}

	settings := s.GetAppSettings()
	if settings.RecentFolders == nil {
		settings.RecentFolders = []string{}
	}

	// Remove if already exists (will re-add at front)
	filtered := []string{}
	for _, f := range settings.RecentFolders {
		if f != folderPath {
			filtered = append(filtered, f)
		}
	}

	// Add to front
	settings.RecentFolders = append([]string{folderPath}, filtered...)

	// Limit to maxRecentFolders
	if len(settings.RecentFolders) > maxRecentFolders {
		settings.RecentFolders = settings.RecentFolders[:maxRecentFolders]
	}

	// Also update LastRepoPath
	settings.LastRepoPath = folderPath

	return s.SaveAppSettings(settings)
}

// ClearRecentFolders clears the recent folders list
func (s *SettingsService) ClearRecentFolders() error {
	settings := s.GetAppSettings()
	settings.RecentFolders = []string{}
	return s.SaveAppSettings(settings)
}

// GetUserProfile returns the git user config (global or for a specific repo)
// Uses concurrent goroutines to fetch name and email in parallel
func (s *SettingsService) GetUserProfile(repoPath string) UserProfile {
	profile := UserProfile{}

	// If repoPath is provided, try to get local config first
	workDir := "."
	if repoPath != "" {
		workDir = repoPath
	}

	var wg sync.WaitGroup
	var nameResult, emailResult CommandResult

	// Run both git config commands concurrently
	wg.Add(2)

	// Get user name
	go func() {
		defer wg.Done()
		nameResult = s.runner.RunGit(workDir, "config", "user.name")
	}()

	// Get user email
	go func() {
		defer wg.Done()
		emailResult = s.runner.RunGit(workDir, "config", "user.email")
	}()

	wg.Wait()

	// Process results
	if nameResult.Success {
		profile.Name = strings.TrimSpace(nameResult.Stdout)
	}
	if emailResult.Success {
		profile.Email = strings.TrimSpace(emailResult.Stdout)
	}

	return profile
}

// SetUserProfile sets the git user config
func (s *SettingsService) SetUserProfile(repoPath string, profile UserProfile, global bool) OperationResult {
	workDir := "."
	if repoPath != "" {
		workDir = repoPath
	}

	// Build base args - use separate slices to avoid append side effects
	globalFlag := []string{}
	if global {
		globalFlag = []string{"--global"}
	}

	// Set user name
	if profile.Name != "" {
		nameArgs := append([]string{"config"}, globalFlag...)
		nameArgs = append(nameArgs, "user.name", profile.Name)
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
		emailArgs := append([]string{"config"}, globalFlag...)
		emailArgs = append(emailArgs, "user.email", profile.Email)
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
