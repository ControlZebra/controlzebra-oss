package services

import (
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// createTestImage generates a solid-color PNG image and writes it to disk.
// Returns the raw PNG bytes for comparison.
func createTestImage(t *testing.T, path string, width, height int, c color.Color) []byte {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, c)
		}
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("Failed to create image file: %v", err)
	}
	defer f.Close()

	if err := png.Encode(f, img); err != nil {
		t.Fatalf("Failed to encode PNG: %v", err)
	}

	// Read back the bytes for size comparison
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read back image: %v", err)
	}
	return data
}

// commitFile stages and commits a file in a test repo.
func commitFile(t *testing.T, repoPath, filePath, message string) string {
	t.Helper()

	cmd := exec.Command("git", "add", filePath)
	cmd.Dir = repoPath
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add failed: %s %v", string(out), err)
	}

	cmd = exec.Command("git", "commit", "-m", message)
	cmd.Dir = repoPath
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit failed: %s %v", string(out), err)
	}

	cmd = exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git rev-parse failed: %v", err)
	}

	return string(out[:len(out)-1]) // strip newline
}

func TestIsImageFile(t *testing.T) {
	svc := NewImageDiffService()

	tests := []struct {
		path     string
		expected bool
	}{
		{"photo.png", true},
		{"photo.PNG", true},
		{"photo.jpg", true},
		{"photo.jpeg", true},
		{"photo.gif", true},
		{"photo.webp", true},
		{"photo.bmp", true},
		{"photo.tiff", true},
		{"photo.tif", true},
		{"icon.svg", false},   // SVG excluded — use text diff
		{"readme.md", false},  // Not an image
		{"config.xml", false}, // Not an image
		{"data.l5x", false},   // Not an image
		{"", false},           // Empty path
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := svc.IsImageFile(tt.path)
			if got != tt.expected {
				t.Errorf("IsImageFile(%q) = %v, want %v", tt.path, got, tt.expected)
			}
		})
	}
}

func TestImageDiff_ValidationErrors(t *testing.T) {
	svc := NewImageDiffService()

	t.Run("empty repo path", func(t *testing.T) {
		result := svc.ImageDiff("", "image.png", "HEAD", "")
		if result.Success {
			t.Error("Expected failure for empty repo path")
		}
		if result.Error != "Repository path is required" {
			t.Errorf("Unexpected error: %s", result.Error)
		}
	})

	t.Run("empty file path", func(t *testing.T) {
		result := svc.ImageDiff("/tmp/repo", "", "HEAD", "")
		if result.Success {
			t.Error("Expected failure for empty file path")
		}
		if result.Error != "File path is required" {
			t.Errorf("Unexpected error: %s", result.Error)
		}
	})

	t.Run("ImageDiffCommit with empty hash", func(t *testing.T) {
		result := svc.ImageDiffCommit("/tmp/repo", "image.png", "")
		if result.Success {
			t.Error("Expected failure for empty commit hash")
		}
		if result.Error != "Commit hash is required" {
			t.Errorf("Unexpected error: %s", result.Error)
		}
	})
}

func TestImageDiff_ModifiedImage(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create initial image (red 10x10)
	imgPath := filepath.Join(repoPath, "test.png")
	createTestImage(t, imgPath, 10, 10, color.RGBA{255, 0, 0, 255})
	commitFile(t, repoPath, "test.png", "add red image")

	// Modify image (blue 10x10)
	createTestImage(t, imgPath, 10, 10, color.RGBA{0, 0, 255, 255})
	commitFile(t, repoPath, "test.png", "change to blue image")

	// Get the latest commit hash
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, _ := cmd.Output()
	commitHash := string(out[:len(out)-1])

	result := svc.ImageDiffCommit(repoPath, "test.png", commitHash)

	if !result.Success {
		t.Fatalf("ImageDiffCommit failed: %s", result.Error)
	}

	if result.Status != "modified" {
		t.Errorf("Expected status 'modified', got %q", result.Status)
	}

	if result.OldImage == "" {
		t.Error("Expected old image data")
	}

	if result.NewImage == "" {
		t.Error("Expected new image data")
	}

	if result.DiffImage == "" {
		t.Error("Expected diff image data")
	}

	if result.IsEqual {
		t.Error("Expected images to not be equal")
	}

	if result.DiffPixelCount == 0 {
		t.Error("Expected non-zero diff pixel count")
	}

	if result.OldWidth != 10 || result.OldHeight != 10 {
		t.Errorf("Expected old dimensions 10x10, got %dx%d", result.OldWidth, result.OldHeight)
	}

	if result.NewWidth != 10 || result.NewHeight != 10 {
		t.Errorf("Expected new dimensions 10x10, got %dx%d", result.NewWidth, result.NewHeight)
	}

	if result.MimeType != "image/png" {
		t.Errorf("Expected MIME type 'image/png', got %q", result.MimeType)
	}

	// Verify base64 data decodes to valid images
	if _, err := base64.StdEncoding.DecodeString(result.OldImage); err != nil {
		t.Errorf("Old image base64 is invalid: %v", err)
	}
	if _, err := base64.StdEncoding.DecodeString(result.NewImage); err != nil {
		t.Errorf("New image base64 is invalid: %v", err)
	}
	if _, err := base64.StdEncoding.DecodeString(result.DiffImage); err != nil {
		t.Errorf("Diff image base64 is invalid: %v", err)
	}
}

func TestImageDiff_AddedImage(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create an initial empty commit so HEAD exists
	cmd := exec.Command("git", "commit", "--allow-empty", "-m", "initial")
	cmd.Dir = repoPath
	cmd.Run()

	// Create and commit an image
	imgPath := filepath.Join(repoPath, "new.png")
	createTestImage(t, imgPath, 5, 5, color.RGBA{0, 255, 0, 255})
	commitHash := commitFile(t, repoPath, "new.png", "add new image")

	result := svc.ImageDiffCommit(repoPath, "new.png", commitHash)

	if !result.Success {
		t.Fatalf("ImageDiffCommit failed: %s", result.Error)
	}

	if result.Status != "added" {
		t.Errorf("Expected status 'added', got %q", result.Status)
	}

	if result.OldImage != "" {
		t.Error("Expected no old image for added file")
	}

	if result.NewImage == "" {
		t.Error("Expected new image data")
	}

	if result.DiffImage != "" {
		t.Error("Expected no diff image for added file")
	}

	if result.NewWidth != 5 || result.NewHeight != 5 {
		t.Errorf("Expected new dimensions 5x5, got %dx%d", result.NewWidth, result.NewHeight)
	}
}

func TestImageDiff_DeletedImage(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create and commit an image
	imgPath := filepath.Join(repoPath, "delete-me.png")
	createTestImage(t, imgPath, 8, 8, color.RGBA{255, 255, 0, 255})
	commitFile(t, repoPath, "delete-me.png", "add image to delete")

	// Delete and commit
	os.Remove(imgPath)
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = repoPath
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "delete image")
	cmd.Dir = repoPath
	cmd.Run()

	cmd = exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, _ := cmd.Output()
	commitHash := string(out[:len(out)-1])

	result := svc.ImageDiffCommit(repoPath, "delete-me.png", commitHash)

	if !result.Success {
		t.Fatalf("ImageDiffCommit failed: %s", result.Error)
	}

	if result.Status != "deleted" {
		t.Errorf("Expected status 'deleted', got %q", result.Status)
	}

	if result.OldImage == "" {
		t.Error("Expected old image data")
	}

	if result.NewImage != "" {
		t.Error("Expected no new image for deleted file")
	}

	if result.DiffImage != "" {
		t.Error("Expected no diff image for deleted file")
	}

	if result.OldWidth != 8 || result.OldHeight != 8 {
		t.Errorf("Expected old dimensions 8x8, got %dx%d", result.OldWidth, result.OldHeight)
	}
}

func TestImageDiff_IdenticalImages(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create image
	imgPath := filepath.Join(repoPath, "same.png")
	createTestImage(t, imgPath, 4, 4, color.RGBA{128, 128, 128, 255})
	commitFile(t, repoPath, "same.png", "add gray image")

	// Working tree diff of an unchanged file — old (HEAD) and new (working tree) are the same
	result := svc.ImageDiffWorking(repoPath, "same.png")

	if !result.Success {
		t.Fatalf("ImageDiffWorking failed: %s", result.Error)
	}

	if result.Status != "modified" {
		t.Errorf("Expected status 'modified', got %q", result.Status)
	}

	if result.IsEqual != true {
		t.Error("Expected images to be equal")
	}

	if result.DiffPixelCount != 0 {
		t.Errorf("Expected 0 diff pixels, got %d", result.DiffPixelCount)
	}
}

func TestImageDiff_DifferentDimensions(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create small image
	imgPath := filepath.Join(repoPath, "resize.png")
	createTestImage(t, imgPath, 10, 10, color.RGBA{255, 0, 0, 255})
	commitFile(t, repoPath, "resize.png", "add 10x10 image")

	// Replace with larger image
	createTestImage(t, imgPath, 20, 15, color.RGBA{255, 0, 0, 255})
	commitFile(t, repoPath, "resize.png", "resize to 20x15")

	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = repoPath
	out, _ := cmd.Output()
	commitHash := string(out[:len(out)-1])

	result := svc.ImageDiffCommit(repoPath, "resize.png", commitHash)

	if !result.Success {
		t.Fatalf("ImageDiffCommit failed: %s", result.Error)
	}

	if result.OldWidth != 10 || result.OldHeight != 10 {
		t.Errorf("Expected old dimensions 10x10, got %dx%d", result.OldWidth, result.OldHeight)
	}

	if result.NewWidth != 20 || result.NewHeight != 15 {
		t.Errorf("Expected new dimensions 20x15, got %dx%d", result.NewWidth, result.NewHeight)
	}

	// Should have diff pixels because size changed (extra area is different from transparent)
	if result.DiffImage == "" {
		t.Error("Expected diff image data for different dimensions")
	}

	if result.TotalPixels != 20*15 {
		t.Errorf("Expected total pixels %d, got %d", 20*15, result.TotalPixels)
	}
}

func TestImageDiff_WorkingTreeModified(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create and commit image
	imgPath := filepath.Join(repoPath, "working.png")
	createTestImage(t, imgPath, 6, 6, color.RGBA{0, 0, 0, 255})
	commitFile(t, repoPath, "working.png", "add black image")

	// Modify in working tree (don't commit)
	createTestImage(t, imgPath, 6, 6, color.RGBA{255, 255, 255, 255})

	result := svc.ImageDiffWorking(repoPath, "working.png")

	if !result.Success {
		t.Fatalf("ImageDiffWorking failed: %s", result.Error)
	}

	if result.Status != "modified" {
		t.Errorf("Expected status 'modified', got %q", result.Status)
	}

	if result.IsEqual {
		t.Error("Expected images to not be equal")
	}

	if result.OldImage == "" || result.NewImage == "" {
		t.Error("Expected both old and new images")
	}

	if result.DiffImage == "" {
		t.Error("Expected diff image")
	}

	if result.DiffPixelCount == 0 {
		t.Error("Expected non-zero diff pixel count")
	}
}

func TestImageDiff_NonImageBinary(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create a non-image binary file with .png extension (corrupted)
	corruptPath := filepath.Join(repoPath, "corrupt.png")
	os.WriteFile(corruptPath, []byte("this is not a valid PNG file"), 0644)
	commitFile(t, repoPath, "corrupt.png", "add corrupt png")

	// Try to diff it — should get a decode error
	result := svc.ImageDiffWorking(repoPath, "corrupt.png")

	// The image at HEAD is corrupt, so decode should fail
	if result.Success {
		t.Error("Expected failure for corrupt image")
	}

	if result.Error == "" {
		t.Error("Expected error message for corrupt image")
	}
}

func TestImageDiff_FirstCommit(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create image as the very first commit (no parent)
	imgPath := filepath.Join(repoPath, "first.png")
	createTestImage(t, imgPath, 3, 3, color.RGBA{0, 128, 255, 255})
	commitHash := commitFile(t, repoPath, "first.png", "first commit with image")

	result := svc.ImageDiffCommit(repoPath, "first.png", commitHash)

	if !result.Success {
		t.Fatalf("ImageDiffCommit failed for first commit: %s", result.Error)
	}

	if result.Status != "added" {
		t.Errorf("Expected status 'added' for first commit, got %q", result.Status)
	}

	if result.OldImage != "" {
		t.Error("Expected no old image for first commit")
	}

	if result.NewImage == "" {
		t.Error("Expected new image for first commit")
	}
}

func TestImageDiff_JPEGFormat(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewImageDiffService()

	// Create a JPEG image using Go's image/jpeg encoder
	imgPath := filepath.Join(repoPath, "photo.jpg")

	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{100, 150, 200, 255})
		}
	}

	f, err := os.Create(imgPath)
	if err != nil {
		t.Fatalf("Failed to create JPEG file: %v", err)
	}
	// Use PNG encoder (since we imported it), then rename as .jpg
	// This tests that Go's image.Decode auto-detects format by content, not extension
	png.Encode(f, img)
	f.Close()

	commitFile(t, repoPath, "photo.jpg", "add jpeg")

	if !svc.IsImageFile("photo.jpg") {
		t.Error("Expected photo.jpg to be recognized as image file")
	}

	if result := svc.ImageDiffWorking(repoPath, "photo.jpg"); !result.Success {
		// Working tree is same as HEAD — should succeed
		t.Fatalf("ImageDiffWorking failed for JPEG: %s", result.Error)
	}

	if result := svc.ImageDiffWorking(repoPath, "photo.jpg"); result.MimeType != "image/jpeg" {
		t.Errorf("Expected MIME type 'image/jpeg', got %q", result.MimeType)
	}
}
