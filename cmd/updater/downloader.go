package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// downloadProgress is emitted as JSON lines to stdout during download.
type downloadProgress struct {
	Progress progressInfo `json:"progress"`
}

type progressInfo struct {
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
}

// downloadResult is the final JSON line written to stdout.
type downloadResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path,omitempty"`
	Error   string `json:"error,omitempty"`
}

// runDownload implements the "cz-updater download" subcommand.
//
// It downloads a binary from the given URL, streams SHA-256 progress lines to
// stdout, and verifies the checksum on completion. The downloaded file is staged
// in a temporary directory.
//
// Usage:
//
//	cz-updater download --url <download-url> --checksum <sha256:hex> [--output <dir>]
func runDownload(args []string) error {
	fs := flag.NewFlagSet("download", flag.ContinueOnError)

	var (
		url      string
		checksum string
		output   string
	)

	fs.StringVar(&url, "url", "", "Download URL for the update binary (required)")
	fs.StringVar(&checksum, "checksum", "", "Expected checksum, formatted as sha256:<hex> (required)")
	fs.StringVar(&output, "output", "", "Output directory for staged binary (default: system temp dir)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	if url == "" {
		return fmt.Errorf("--url is required")
	}
	if checksum == "" {
		return fmt.Errorf("--checksum is required")
	}

	// Parse the checksum — we only support sha256 for now
	expectedHash, err := parseChecksum(checksum)
	if err != nil {
		return err
	}

	// Create the staging directory
	stagingDir, err := createStagingDir(output)
	if err != nil {
		return err
	}

	// Download with progress
	stagedPath, err := downloadWithProgress(url, stagingDir, expectedHash)
	if err != nil {
		// Write failure result for the main app to parse
		writeResult(downloadResult{Success: false, Error: err.Error()})
		return nil // We already wrote the error as JSON — don't double-report
	}

	writeResult(downloadResult{Success: true, Path: stagedPath})
	return nil
}

// parseChecksum validates and extracts the hex hash from a "sha256:<hex>" string.
func parseChecksum(s string) (string, error) {
	if !strings.HasPrefix(s, "sha256:") {
		return "", fmt.Errorf("unsupported checksum format %q (expected sha256:<hex>)", s)
	}
	hexStr := strings.TrimPrefix(s, "sha256:")
	if len(hexStr) != 64 {
		return "", fmt.Errorf("invalid SHA-256 hash length: got %d chars, expected 64", len(hexStr))
	}
	// Validate hex
	if _, err := hex.DecodeString(hexStr); err != nil {
		return "", fmt.Errorf("invalid hex in checksum: %w", err)
	}
	return hexStr, nil
}

// createStagingDir creates the staging directory for the update download.
func createStagingDir(base string) (string, error) {
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "cz-update-staging")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create staging directory: %w", err)
	}
	return dir, nil
}

// downloadWithProgress performs the HTTP download, streams progress to stdout,
// computes a SHA-256 hash inline, and returns the path to the staged file.
func downloadWithProgress(url, stagingDir, expectedHash string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}

	totalSize := resp.ContentLength // -1 if unknown

	// Determine the output filename from the URL path
	filename := filepath.Base(url)
	if filename == "" || filename == "." || filename == "/" {
		filename = "cz-update-download"
	}
	stagedPath := filepath.Join(stagingDir, filename)

	// Create the output file
	f, err := os.Create(stagedPath)
	if err != nil {
		return "", fmt.Errorf("failed to create staged file: %w", err)
	}
	defer f.Close()

	// Stream download: hash inline, report progress periodically
	hasher := sha256.New()
	writer := io.MultiWriter(f, hasher)

	buf := make([]byte, 64*1024) // 64 KB read buffer
	var downloaded int64
	lastReport := time.Now()

	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := writer.Write(buf[:n]); writeErr != nil {
				return "", fmt.Errorf("failed to write staged file: %w", writeErr)
			}
			downloaded += int64(n)

			// Emit progress at most every 500ms to avoid flooding stdout
			if time.Since(lastReport) >= 500*time.Millisecond {
				emitProgress(downloaded, totalSize)
				lastReport = time.Now()
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return "", fmt.Errorf("download stream error: %w", readErr)
		}
	}

	// Final progress report
	emitProgress(downloaded, totalSize)

	// Close the file before checking hash (flush to disk)
	if err := f.Close(); err != nil {
		return "", fmt.Errorf("failed to close staged file: %w", err)
	}

	// Verify checksum
	actualHash := hex.EncodeToString(hasher.Sum(nil))
	if actualHash != expectedHash {
		// Clean up the bad download
		os.Remove(stagedPath)
		return "", fmt.Errorf("checksum mismatch: expected %s, got %s", expectedHash, actualHash)
	}

	return stagedPath, nil
}

// emitProgress writes a JSON progress line to stdout.
func emitProgress(downloaded, total int64) {
	var percent float64
	if total > 0 {
		percent = float64(downloaded) / float64(total) * 100.0
	}
	p := downloadProgress{
		Progress: progressInfo{
			Downloaded: downloaded,
			Total:      total,
			Percent:    percent,
		},
	}
	data, _ := json.Marshal(p)
	fmt.Fprintln(os.Stdout, string(data))
}

// writeResult writes the final download result as JSON to stdout.
func writeResult(r downloadResult) {
	data, _ := json.Marshal(r)
	fmt.Fprintln(os.Stdout, string(data))
}
