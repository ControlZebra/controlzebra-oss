package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTextViewerSizeLimitMatchesWorkingAndRevisionReads(t *testing.T) {
	repo := createTestRepo(t)
	defer cleanupTestRepo(t, repo)
	for _, size := range []int{maxTextViewerSize, maxTextViewerSize + 1} {
		name := "program.L5X"
		if err := os.WriteFile(filepath.Join(repo, name), []byte(strings.Repeat("x", size)), 0600); err != nil {
			t.Fatal(err)
		}
		runGitCmd(t, repo, "add", name)
		runGitCmd(t, repo, "commit", "-m", "Update file")
		working := NewFileSystemService().ReadTextFile(filepath.Join(repo, name))
		revision := NewGitService().ReadFileAtRevisionLarge(repo, name, "HEAD")
		tooLarge := size > maxTextViewerSize
		if working.Success == tooLarge || revision.HasError != tooLarge {
			t.Fatalf("size %d: working success=%v, revision error=%v", size, working.Success, revision.HasError)
		}
		if tooLarge {
			if revision.Content != "" || working.Content != "" || revision.Error != working.Error {
				t.Fatal("oversized text must be withheld with the same size-limit message")
			}
		} else if len(working.Content) != size || len(revision.Content) != size {
			t.Fatal("files at the limit should be displayed in full")
		}
	}
}
