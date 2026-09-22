package main

import (
	"archive/zip"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestOfflineArchiveRequiresMatchingChecksum(t *testing.T) {
	path := filepath.Join(t.TempDir(), "archive.zip")
	content := []byte("verified archive")
	a := artifact{URL: "https://invalid.example/never-contact", SHA256: fmt.Sprintf("%x", sha256.Sum256(content))}
	if err := fetchArchive(a, path, true); err == nil {
		t.Fatal("missing archive accepted")
	}
	if err := os.WriteFile(path, content, 0644); err != nil {
		t.Fatal(err)
	}
	if err := fetchArchive(a, path, true); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("corrupt"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := fetchArchive(a, path, true); err == nil {
		t.Fatal("corrupt archive accepted")
	}
}

func TestExtractionRejectsEscapingEntries(t *testing.T) {
	for _, name := range []string{"../escape.exe", `..\escape.exe`, "/absolute.exe", "C:/absolute.exe"} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "archive.zip")
			f, err := os.Create(path)
			if err != nil {
				t.Fatal(err)
			}
			w := zip.NewWriter(f)
			entry, err := w.Create(name)
			if err != nil {
				t.Fatal(err)
			}
			entry.Write([]byte("payload"))
			w.Close()
			f.Close()
			if err := extractArchive(path, filepath.Join(root, "output")); err == nil {
				t.Fatal("unsafe entry accepted")
			}
			if _, err := os.Stat(filepath.Join(root, "escape.exe")); !os.IsNotExist(err) {
				t.Fatal("escaped extraction")
			}
		})
	}
}

func TestIncompleteBundleRejected(t *testing.T) {
	root := t.TempDir()
	for _, rel := range []string{"git/cmd/git.exe", "git/usr/bin/sh.exe", "gh/bin/gh.exe", "lfs/git-lfs.exe"} {
		if err := validateBundle(root); err == nil {
			t.Fatalf("bundle accepted before %s", rel)
		}
		path := filepath.Join(root, filepath.FromSlash(rel))
		os.MkdirAll(filepath.Dir(path), 0755)
		os.WriteFile(path, []byte("exe"), 0644)
	}
	if err := validateBundle(root); err != nil {
		t.Fatal(err)
	}
}
