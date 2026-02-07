package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// UpdateManifest is the top-level JSON structure served at the update URL.
// It describes the latest available release across all supported platforms.
type UpdateManifest struct {
	Version      string                      `json:"version"`
	ReleaseDate  string                      `json:"releaseDate"`
	ReleaseNotes string                      `json:"releaseNotes"`
	Platforms    map[string]PlatformArtifact `json:"platforms"`
	MinVersion   string                      `json:"minimumVersion,omitempty"`
	Mandatory    bool                        `json:"mandatory,omitempty"`
}

// PlatformArtifact describes a single platform-specific download.
// Platform keys follow the pattern "<GOOS>-<GOARCH>", e.g. "darwin-arm64", "windows-amd64".
type PlatformArtifact struct {
	URL      string `json:"url"`
	Size     int64  `json:"size"`
	Checksum string `json:"checksum"` // "sha256:<hex>"
}

// FetchManifest downloads and parses the update manifest from the given base URL.
// It expects the manifest at <baseURL>/update.json.
func FetchManifest(baseURL string, timeout time.Duration) (*UpdateManifest, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	manifestURL := baseURL + "/update.json"

	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(manifestURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch manifest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("manifest returned HTTP %d", resp.StatusCode)
	}

	// Limit manifest size to 1 MB to prevent abuse
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest body: %w", err)
	}

	var manifest UpdateManifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest JSON: %w", err)
	}

	if manifest.Version == "" {
		return nil, fmt.Errorf("manifest missing required 'version' field")
	}
	if len(manifest.Platforms) == 0 {
		return nil, fmt.Errorf("manifest missing required 'platforms' field")
	}

	return &manifest, nil
}

// PlatformKey returns the manifest lookup key for the given OS and architecture.
// Example: PlatformKey("darwin", "arm64") returns "darwin-arm64".
func PlatformKey(goos, goarch string) string {
	return goos + "-" + goarch
}
