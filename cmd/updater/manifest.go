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
// This is a convenience wrapper around FetchManifestRaw + ParseManifest.
func FetchManifest(baseURL string, timeout time.Duration) (*UpdateManifest, error) {
	raw, err := FetchManifestRaw(baseURL, timeout)
	if err != nil {
		return nil, err
	}
	return ParseManifest(raw)
}

// FetchManifestRaw downloads the raw bytes of update.json from the given base URL.
// Returns the raw bytes without parsing — useful when signature verification
// must happen before parsing (verify the exact bytes that were signed).
func FetchManifestRaw(baseURL string, timeout time.Duration) ([]byte, error) {
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

	return body, nil
}

// ParseManifest parses raw JSON bytes into an UpdateManifest.
// Validates that required fields (version, platforms) are present.
func ParseManifest(data []byte) (*UpdateManifest, error) {
	var manifest UpdateManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
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

// FetchManifestWithVerification downloads the manifest and optionally verifies
// its Ed25519 signature before parsing. This is the secure path used when a
// public key is available.
//
// Flow:
//  1. Fetch raw manifest bytes (update.json)
//  2. If publicKeyB64 is non-empty: fetch signature (update.json.sig) and verify
//  3. Parse the verified manifest bytes
//
// If publicKeyB64 is empty, signature verification is skipped (dev mode).
func FetchManifestWithVerification(baseURL string, timeout time.Duration, publicKeyB64 string) (*UpdateManifest, error) {
	// Step 1: fetch raw bytes
	rawBytes, err := FetchManifestRaw(baseURL, timeout)
	if err != nil {
		return nil, err
	}

	// Step 2: verify signature if public key is provided
	if publicKeyB64 != "" {
		sig, err := FetchSignature(baseURL, timeout)
		if err != nil {
			return nil, fmt.Errorf("signature verification required but failed: %w", err)
		}

		if err := VerifyManifestSignature(rawBytes, publicKeyB64, sig); err != nil {
			return nil, err
		}
	}

	// Step 3: parse verified manifest
	return ParseManifest(rawBytes)
}

// PlatformKey returns the manifest lookup key for the given OS and architecture.
// Example: PlatformKey("darwin", "arm64") returns "darwin-arm64".
func PlatformKey(goos, goarch string) string {
	return goos + "-" + goarch
}
