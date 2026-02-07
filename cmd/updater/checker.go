package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

// checkResult is the JSON structure written to stdout by the check subcommand.
type checkResult struct {
	Available      bool   `json:"available"`
	Version        string `json:"version,omitempty"`
	ReleaseNotes   string `json:"releaseNotes,omitempty"`
	DownloadURL    string `json:"downloadURL,omitempty"`
	Size           int64  `json:"size,omitempty"`
	Checksum       string `json:"checksum,omitempty"`
	ReleaseDate    string `json:"releaseDate,omitempty"`
	Mandatory      bool   `json:"mandatory,omitempty"`
	CurrentVersion string `json:"currentVersion,omitempty"`
}

// runCheck implements the "cz-updater check" subcommand.
//
// It fetches the update manifest from the given URL, optionally verifies its
// Ed25519 signature, finds the platform entry matching the user's OS/arch, and
// compares versions. The result is written as JSON to stdout (exit 0). Errors
// go to stderr (exit 1).
//
// Signature verification:
//   - If --public-key is provided, it overrides the compiled-in PublicKey.
//   - If a public key is available (either source), the manifest signature is
//     verified before parsing. Unsigned/tampered manifests are rejected.
//   - If no public key is available, verification is skipped (dev mode).
//
// Usage:
//
//	cz-updater check --url <manifest-base-url> --current <version> --os <GOOS> --arch <GOARCH> [--public-key <base64>]
func runCheck(args []string) error {
	fs := flag.NewFlagSet("check", flag.ContinueOnError)

	var (
		url       string
		current   string
		goos      string
		goarch    string
		timeout   int
		publicKey string
	)

	fs.StringVar(&url, "url", "", "Base URL of the update manifest (required)")
	fs.StringVar(&current, "current", "", "Current app version (required)")
	fs.StringVar(&goos, "os", "", "Target OS, e.g. darwin, windows, linux (required)")
	fs.StringVar(&goarch, "arch", "", "Target architecture, e.g. amd64, arm64 (required)")
	fs.IntVar(&timeout, "timeout", 30, "HTTP timeout in seconds")
	fs.StringVar(&publicKey, "public-key", "", "Base64-encoded Ed25519 public key for signature verification (overrides compiled-in key)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	// Validate required flags
	if url == "" {
		return fmt.Errorf("--url is required")
	}
	if current == "" {
		return fmt.Errorf("--current is required")
	}
	if goos == "" {
		return fmt.Errorf("--os is required")
	}
	if goarch == "" {
		return fmt.Errorf("--arch is required")
	}

	// Resolve public key: flag > compiled-in > empty (no verification)
	effectiveKey := publicKey
	if effectiveKey == "" {
		effectiveKey = PublicKey
	}

	// Fetch manifest with optional signature verification
	manifest, err := FetchManifestWithVerification(url, time.Duration(timeout)*time.Second, effectiveKey)
	if err != nil {
		return fmt.Errorf("manifest fetch failed: %w", err)
	}

	// Look up the platform-specific artifact
	key := PlatformKey(goos, goarch)
	artifact, ok := manifest.Platforms[key]
	if !ok {
		return fmt.Errorf("no artifact found for platform %q in manifest", key)
	}

	// Compare versions
	newer, err := IsNewer(current, manifest.Version)
	if err != nil {
		return fmt.Errorf("version comparison failed: %w", err)
	}

	var result checkResult
	if newer {
		result = checkResult{
			Available:    true,
			Version:      manifest.Version,
			ReleaseNotes: manifest.ReleaseNotes,
			DownloadURL:  artifact.URL,
			Size:         artifact.Size,
			Checksum:     artifact.Checksum,
			ReleaseDate:  manifest.ReleaseDate,
			Mandatory:    manifest.Mandatory,
		}
	} else {
		result = checkResult{
			Available:      false,
			CurrentVersion: current,
		}
	}

	// Write result as JSON to stdout
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(result)
}
