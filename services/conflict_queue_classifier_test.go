package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type fakeConflictGit struct {
	lsFiles     CommandResult
	batchCheck  CommandResult
	blobs       map[string][]byte
	blobErrors  map[string]error
	stdinInputs []string
}

func (f *fakeConflictGit) RunGit(_ string, args ...string) CommandResult {
	if len(args) > 0 && args[0] == "ls-files" {
		return f.lsFiles
	}
	return CommandResult{Success: false, Error: "unexpected command " + strings.Join(args, " ")}
}

func (f *fakeConflictGit) RunGitRaw(_ string, args ...string) ([]byte, error) {
	if len(args) == 3 && args[0] == "cat-file" && args[1] == "blob" {
		if err, failing := f.blobErrors[args[2]]; failing {
			return nil, err
		}
		if content, exists := f.blobs[args[2]]; exists {
			return content, nil
		}
	}
	return nil, fmt.Errorf("unexpected raw command %s", strings.Join(args, " "))
}

func (f *fakeConflictGit) RunGitWithStdin(_ string, stdinInput string, args ...string) CommandResult {
	f.stdinInputs = append(f.stdinInputs, stdinInput)
	if len(args) >= 2 && args[0] == "cat-file" && args[1] == "--batch-check" {
		return f.batchCheck
	}
	return CommandResult{Success: false, Error: "unexpected stdin command"}
}

func unmergedRecord(mode string, oid string, stage int, path string) string {
	return fmt.Sprintf("%s %s %d\t%s\x00", mode, oid, stage, path)
}

func batchCheckOutput(entries ...string) CommandResult {
	return CommandResult{Success: true, Stdout: strings.Join(entries, "\n") + "\n"}
}

func blobSize(oid string, size int) string {
	return fmt.Sprintf("%s blob %d", oid, size)
}

func findEntry(t *testing.T, entries []ConflictQueueEntry, path string) ConflictQueueEntry {
	t.Helper()
	for _, entry := range entries {
		if entry.Path == path {
			return entry
		}
	}
	t.Fatalf("entry %q not found in %+v", path, entries)
	return ConflictQueueEntry{}
}

func TestParseUnmergedEntriesGroupsStagesByPath(t *testing.T) {
	output := unmergedRecord("100644", "aaa", 1, "src/app.txt") +
		unmergedRecord("100644", "bbb", 2, "src/app.txt") +
		unmergedRecord("100644", "ccc", 3, "src/app.txt") +
		unmergedRecord("100644", "ddd", 3, "other.txt")

	paths, err := parseUnmergedEntries(output)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d", len(paths))
	}
	if len(paths[0].stages) != 3 || paths[0].path != "src/app.txt" {
		t.Fatalf("unexpected first path: %+v", paths[0])
	}
	if paths[0].stages[conflictStageOurs].oid != "bbb" {
		t.Fatalf("unexpected ours oid: %+v", paths[0].stages)
	}
}

func TestParseUnmergedEntriesRejectsMalformedOutput(t *testing.T) {
	cases := map[string]string{
		"missing tab":   "100644 aaa 1 src/app.txt\x00",
		"short header":  "100644 aaa\tsrc/app.txt\x00",
		"bad stage":     "100644 aaa 9\tsrc/app.txt\x00",
		"empty path":    "100644 aaa 1\t\x00",
		"non-numeric":   "100644 aaa x\tsrc/app.txt\x00",
		"missing field": "100644\tsrc/app.txt\x00",
	}

	for name, output := range cases {
		if _, err := parseUnmergedEntries(output); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestConflictKindFromStages(t *testing.T) {
	cases := []struct {
		base, ours, theirs bool
		expected           ConflictKind
	}{
		{true, true, true, ConflictKindBothModified},
		{false, true, true, ConflictKindBothAdded},
		{true, true, false, ConflictKindDeletedByThem},
		{true, false, true, ConflictKindDeletedByUs},
		{false, true, false, ConflictKindAddedByUs},
		{false, false, true, ConflictKindAddedByThem},
		{true, false, false, ConflictKindBothDeleted},
		{false, false, false, ConflictKindUnknown},
	}

	for _, testCase := range cases {
		got := conflictKindFromStages(testCase.base, testCase.ours, testCase.theirs)
		if got != testCase.expected {
			t.Fatalf("stages(%v,%v,%v): expected %s, got %s",
				testCase.base, testCase.ours, testCase.theirs, testCase.expected, got)
		}
	}
}

func TestClassifyConflictQueueSortsAlphabetically(t *testing.T) {
	git := &fakeConflictGit{
		lsFiles: CommandResult{Success: true, Stdout: unmergedRecord("100644", "zzz", 2, "zebra.txt") +
			unmergedRecord("100644", "zzz2", 3, "zebra.txt") +
			unmergedRecord("100644", "aaa", 2, "alpha.txt") +
			unmergedRecord("100644", "aaa2", 3, "alpha.txt") +
			unmergedRecord("100644", "mmm", 2, "middle.txt") +
			unmergedRecord("100644", "mmm2", 3, "middle.txt")},
		batchCheck: batchCheckOutput(
			blobSize("zzz", 10), blobSize("zzz2", 10),
			blobSize("aaa", 10), blobSize("aaa2", 10),
			blobSize("mmm", 10), blobSize("mmm2", 10)),
		blobs: map[string][]byte{
			"zzz": []byte("zebra"), "aaa": []byte("alpha"), "mmm": []byte("middle"),
		},
	}

	entries, err := classifyConflictQueue(git, "/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	paths := []string{}
	for _, entry := range entries {
		paths = append(paths, entry.Path)
	}
	expected := []string{"alpha.txt", "middle.txt", "zebra.txt"}
	if strings.Join(paths, ",") != strings.Join(expected, ",") {
		t.Fatalf("expected %v, got %v", expected, paths)
	}
}

func TestClassifyConflictQueueEligibilityRules(t *testing.T) {
	largeSize := int64(conflictQueueBlobSizeLimit + 1)
	git := &fakeConflictGit{
		lsFiles: CommandResult{Success: true, Stdout: strings.Join([]string{
			unmergedRecord("100644", "t1", 2, "notes.txt"),
			unmergedRecord("100644", "t2", 3, "notes.txt"),
			unmergedRecord("100644", "l1", 2, "routine.l5x"),
			unmergedRecord("100644", "l2", 3, "routine.l5x"),
			unmergedRecord("100644", "i1", 2, "logo.PNG"),
			unmergedRecord("100644", "i2", 3, "logo.PNG"),
			unmergedRecord("100644", "b1", 2, "payload.dat"),
			unmergedRecord("100644", "b2", 3, "payload.dat"),
			unmergedRecord("160000", "s1", 2, "vendor/lib"),
			unmergedRecord("160000", "s2", 3, "vendor/lib"),
			unmergedRecord("120000", "y1", 2, "link"),
			unmergedRecord("120000", "y2", 3, "link"),
			unmergedRecord("100644", "g1", 1, "huge.txt"),
			unmergedRecord("100644", "g2", 2, "huge.txt"),
			unmergedRecord("100644", "g3", 3, "huge.txt"),
			unmergedRecord("100644", "o1", 1, "removed.txt"),
			unmergedRecord("100644", "o2", 2, "removed.txt"),
			unmergedRecord("100755", "x1", 2, "script.sh"),
			unmergedRecord("100755", "x2", 3, "script.sh"),
		}, "")},
		batchCheck: batchCheckOutput(
			blobSize("t1", 5), blobSize("t2", 5),
			blobSize("l1", 5), blobSize("l2", 5),
			blobSize("i1", 5), blobSize("i2", 5),
			blobSize("b1", 5), blobSize("b2", 5),
			blobSize("s1", 5), blobSize("s2", 5),
			blobSize("y1", 5), blobSize("y2", 5),
			fmt.Sprintf("g1 blob %d", largeSize),
			fmt.Sprintf("g2 blob %d", largeSize),
			fmt.Sprintf("g3 blob %d", largeSize),
			blobSize("o1", 5), blobSize("o2", 5),
			blobSize("x1", 5), blobSize("x2", 5),
		),
		blobs: map[string][]byte{
			"t1": []byte("hello"),
			"l1": []byte("<RSLogix5000Content/>"),
			"b1": []byte{0x00, 0x01, 0x02},
			"o2": []byte("kept"),
			"x1": []byte("#!/bin/sh\n"),
		},
	}

	entries, err := classifyConflictQueue(git, "/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cases := []struct {
		path        string
		fileKind    ConflictFileKind
		eligibility ConflictEligibility
		reason      string
	}{
		{"notes.txt", ConflictFileKindText, ConflictEligible, ""},
		{"routine.l5x", ConflictFileKindL5X, ConflictEligible, ""},
		{"script.sh", ConflictFileKindText, ConflictEligible, ""},
		{"logo.PNG", ConflictFileKindImage, ConflictIneligible, ConflictReasonImage},
		{"payload.dat", ConflictFileKindBinary, ConflictIneligible, ConflictReasonBinary},
		{"vendor/lib", ConflictFileKindSubmodule, ConflictIneligible, ConflictReasonSubmodule},
		{"link", ConflictFileKindSymlink, ConflictIneligible, ConflictReasonSymlink},
		{"huge.txt", ConflictFileKindText, ConflictIneligible, ConflictReasonTooLarge},
		{"removed.txt", ConflictFileKindText, ConflictIneligible, ConflictReasonOneSided},
	}

	for _, testCase := range cases {
		entry := findEntry(t, entries, testCase.path)
		if entry.FileKind != testCase.fileKind {
			t.Fatalf("%s: expected file kind %s, got %s", testCase.path, testCase.fileKind, entry.FileKind)
		}
		if entry.Eligibility != testCase.eligibility {
			t.Fatalf("%s: expected %s, got %s (%s)", testCase.path, testCase.eligibility, entry.Eligibility, entry.IneligibleReason)
		}
		if entry.IneligibleReason != testCase.reason {
			t.Fatalf("%s: expected reason %q, got %q", testCase.path, testCase.reason, entry.IneligibleReason)
		}
	}
}

func TestClassifyConflictQueueTreatsUnknownSizeAsUnsafe(t *testing.T) {
	git := &fakeConflictGit{
		lsFiles: CommandResult{Success: true, Stdout: unmergedRecord("100644", "a", 2, "notes.txt") +
			unmergedRecord("100644", "b", 3, "notes.txt")},
		batchCheck: batchCheckOutput(blobSize("a", 5)),
		blobs:      map[string][]byte{"a": []byte("hello")},
	}

	entries, err := classifyConflictQueue(git, "/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entry := findEntry(t, entries, "notes.txt")
	if entry.Eligibility != ConflictIneligible || entry.IneligibleReason != ConflictReasonTooLarge {
		t.Fatalf("expected unknown size to be ineligible, got %+v", entry)
	}
}

func TestClassifyConflictQueueReportsLargestStageSize(t *testing.T) {
	git := &fakeConflictGit{
		lsFiles: CommandResult{Success: true, Stdout: unmergedRecord("100644", "a", 1, "notes.txt") +
			unmergedRecord("100644", "b", 2, "notes.txt") +
			unmergedRecord("100644", "c", 3, "notes.txt")},
		batchCheck: batchCheckOutput(blobSize("a", 10), blobSize("b", 42), blobSize("c", 7)),
		blobs:      map[string][]byte{"b": []byte("hello")},
	}

	entries, err := classifyConflictQueue(git, "/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries[0].SizeBytes != 42 {
		t.Fatalf("expected size 42, got %d", entries[0].SizeBytes)
	}
}

func TestClassifyConflictQueuePropagatesListFailure(t *testing.T) {
	git := &fakeConflictGit{lsFiles: CommandResult{Success: false, Stderr: "not a git repository"}}

	if _, err := classifyConflictQueue(git, "/repo"); err == nil {
		t.Fatal("expected an error when ls-files fails")
	}
}

func TestClassifyConflictQueueEmptyRepositoryReturnsEmptySlice(t *testing.T) {
	git := &fakeConflictGit{lsFiles: CommandResult{Success: true, Stdout: ""}}

	entries, err := classifyConflictQueue(git, "/repo")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entries == nil || len(entries) != 0 {
		t.Fatalf("expected an empty non-nil slice, got %#v", entries)
	}
}

func TestIsConflictQueueText(t *testing.T) {
	cases := []struct {
		name     string
		sample   []byte
		expected bool
	}{
		{"empty", nil, true},
		{"ascii", []byte("hello world\n"), true},
		{"utf8", []byte("héllo wörld"), true},
		{"bom", append([]byte{0xEF, 0xBB, 0xBF}, []byte("text")...), true},
		{"nul byte", []byte{'a', 0x00, 'b'}, false},
		{"invalid utf8", append([]byte{0xC3, 0x28}, []byte(strings.Repeat("a", 10))...), false},
		{"truncated rune at end", []byte("abc\xC3"), true},
	}

	for _, testCase := range cases {
		if got := isConflictQueueText(testCase.sample); got != testCase.expected {
			t.Fatalf("%s: expected %v, got %v", testCase.name, testCase.expected, got)
		}
	}
}

// TestClassifyConflictQueueAgainstRealRepository exercises the classifier
// against genuine git output for every conflict kind we expect to encounter.
func TestClassifyConflictQueueAgainstRealRepository(t *testing.T) {
	repoPath := createMultiKindConflictRepo(t)
	defer cleanupTestRepo(t, repoPath)

	entries, err := classifyConflictQueue(NewCommandRunner(), repoPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedKinds := map[string]ConflictKind{
		"both-added.txt":      ConflictKindBothAdded,
		"both-modified.txt":   ConflictKindBothModified,
		"deleted-by-them.txt": ConflictKindDeletedByThem,
		"deleted-by-us.txt":   ConflictKindDeletedByUs,
		"routine.l5x":         ConflictKindBothModified,
		"payload.bin":         ConflictKindBothModified,
	}

	for path, expected := range expectedKinds {
		entry := findEntry(t, entries, path)
		if entry.Kind != expected {
			t.Fatalf("%s: expected kind %s, got %s", path, expected, entry.Kind)
		}
	}

	if entry := findEntry(t, entries, "routine.l5x"); entry.FileKind != ConflictFileKindL5X || entry.Eligibility != ConflictEligible {
		t.Fatalf("expected eligible L5X entry, got %+v", entry)
	}
	if entry := findEntry(t, entries, "payload.bin"); entry.FileKind != ConflictFileKindBinary || entry.IneligibleReason != ConflictReasonBinary {
		t.Fatalf("expected binary entry, got %+v", entry)
	}
	if entry := findEntry(t, entries, "deleted-by-us.txt"); entry.HasOurs || !entry.HasTheirs || !entry.HasBase {
		t.Fatalf("unexpected stage presence for deleted-by-us: %+v", entry)
	}
	if entry := findEntry(t, entries, "both-modified.txt"); entry.SizeBytes <= 0 {
		t.Fatalf("expected a non-zero size, got %+v", entry)
	}

	sorted := make([]string, 0, len(entries))
	for _, entry := range entries {
		sorted = append(sorted, entry.Path)
	}
	for index := 1; index < len(sorted); index++ {
		if sorted[index-1] > sorted[index] {
			t.Fatalf("entries are not sorted: %v", sorted)
		}
	}
}

// createMultiKindConflictRepo builds a repository whose merge produces one
// conflict of every kind the queue classifies.
func createMultiKindConflictRepo(t *testing.T) string {
	t.Helper()
	repoPath := createTestRepo(t)
	runGitCmd(t, repoPath, "config", "core.autocrlf", "false")

	write := func(path string, content []byte) {
		t.Helper()
		full := filepath.Join(repoPath, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
		if err := os.WriteFile(full, content, 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
	remove := func(path string) {
		t.Helper()
		if err := os.Remove(filepath.Join(repoPath, filepath.FromSlash(path))); err != nil {
			t.Fatalf("remove %s: %v", path, err)
		}
	}

	write("both-modified.txt", []byte("base\n"))
	write("deleted-by-them.txt", []byte("base\n"))
	write("deleted-by-us.txt", []byte("base\n"))
	write("routine.l5x", []byte("<RSLogix5000Content>\n<Rung>base</Rung>\n</RSLogix5000Content>\n"))
	write("payload.bin", []byte{0x00, 0x01, 0x02, 0x03})
	runGitCmd(t, repoPath, "add", "-A")
	runGitCmd(t, repoPath, "commit", "-m", "base")
	mainBranch := strings.TrimSpace(runGitOutput(t, repoPath, "branch", "--show-current"))

	runGitCmd(t, repoPath, "checkout", "-b", "incoming-test")
	write("both-modified.txt", []byte("incoming\n"))
	write("both-added.txt", []byte("incoming\n"))
	write("routine.l5x", []byte("<RSLogix5000Content>\n<Rung>incoming</Rung>\n</RSLogix5000Content>\n"))
	write("payload.bin", []byte{0x00, 0x09, 0x09, 0x09})
	write("deleted-by-them.txt", []byte("base\n"))
	remove("deleted-by-them.txt")
	write("deleted-by-us.txt", []byte("incoming\n"))
	runGitCmd(t, repoPath, "add", "-A")
	runGitCmd(t, repoPath, "commit", "-m", "incoming")

	runGitCmd(t, repoPath, "checkout", mainBranch)
	write("both-modified.txt", []byte("current\n"))
	write("both-added.txt", []byte("current\n"))
	write("routine.l5x", []byte("<RSLogix5000Content>\n<Rung>current</Rung>\n</RSLogix5000Content>\n"))
	write("payload.bin", []byte{0x00, 0x07, 0x07, 0x07})
	write("deleted-by-them.txt", []byte("current\n"))
	remove("deleted-by-us.txt")
	runGitCmd(t, repoPath, "add", "-A")
	runGitCmd(t, repoPath, "commit", "-m", "current")

	merge := exec.Command("git", "merge", "incoming-test")
	merge.Dir = repoPath
	if output, err := merge.CombinedOutput(); err == nil {
		cleanupTestRepo(t, repoPath)
		t.Fatalf("expected merge conflicts, output: %s", output)
	}
	return repoPath
}
