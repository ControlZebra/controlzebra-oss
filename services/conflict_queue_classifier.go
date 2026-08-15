package services

import (
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	// conflictQueueBlobSizeLimit is the largest conflicted blob the in-app
	// resolver is willing to load. Larger files are queued but marked
	// ineligible so the user is told why instead of hitting a stall.
	conflictQueueBlobSizeLimit = 50 * 1024 * 1024

	// conflictQueueSniffLimit bounds how much of a blob is inspected when
	// deciding whether it is text or binary.
	conflictQueueSniffLimit = 8 * 1024

	conflictStageBase    = 1
	conflictStageOurs    = 2
	conflictStageTheirs  = 3
	regularFileMode      = "100644"
	executableFileMode   = "100755"
	symlinkFileMode      = "120000"
	gitlinkFileMode      = "160000"
	unmergedRecordFields = 3
)

// ConflictKind describes how a path became unmerged, derived from which index
// stages git recorded for it.
type ConflictKind string

const (
	ConflictKindBothModified  ConflictKind = "both-modified"
	ConflictKindBothAdded     ConflictKind = "both-added"
	ConflictKindAddedByUs     ConflictKind = "added-by-us"
	ConflictKindAddedByThem   ConflictKind = "added-by-them"
	ConflictKindDeletedByUs   ConflictKind = "deleted-by-us"
	ConflictKindDeletedByThem ConflictKind = "deleted-by-them"
	ConflictKindBothDeleted   ConflictKind = "both-deleted"
	ConflictKindUnknown       ConflictKind = "unknown"
)

// ConflictFileKind describes what sort of content the conflicted path holds.
type ConflictFileKind string

const (
	ConflictFileKindText      ConflictFileKind = "text"
	ConflictFileKindL5X       ConflictFileKind = "l5x"
	ConflictFileKindImage     ConflictFileKind = "image"
	ConflictFileKindBinary    ConflictFileKind = "binary"
	ConflictFileKindSubmodule ConflictFileKind = "submodule"
	ConflictFileKindSymlink   ConflictFileKind = "symlink"
	ConflictFileKindUnknown   ConflictFileKind = "unknown"
)

// ConflictEligibility reports whether the in-app resolver can present the file.
type ConflictEligibility string

const (
	ConflictEligible   ConflictEligibility = "eligible"
	ConflictIneligible ConflictEligibility = "ineligible"
)

// Reasons a conflicted file cannot be opened in the in-app resolver.
const (
	ConflictReasonSubmodule       = "submodule"
	ConflictReasonSymlink         = "symlink"
	ConflictReasonUnsupportedMode = "unsupported-mode"
	ConflictReasonTooLarge        = "too-large"
	ConflictReasonImage           = "image"
	ConflictReasonBinary          = "binary"
	ConflictReasonNotUTF8         = "not-utf8"
	ConflictReasonOneSided        = "one-sided"
)

// ConflictQueueEntry is one conflicted path with everything the queue knows
// about it without parsing conflict regions.
type ConflictQueueEntry struct {
	Path             string              `json:"path"`
	Kind             ConflictKind        `json:"kind"`
	FileKind         ConflictFileKind    `json:"fileKind"`
	Eligibility      ConflictEligibility `json:"eligibility"`
	IneligibleReason string              `json:"ineligibleReason,omitempty"`
	SizeBytes        int64               `json:"sizeBytes"`
	HasBase          bool                `json:"hasBase"`
	HasOurs          bool                `json:"hasOurs"`
	HasTheirs        bool                `json:"hasTheirs"`
}

// conflictQueueGit is the slice of CommandRunner the classifier needs, kept
// narrow so tests can supply a fake.
type conflictQueueGit interface {
	RunGit(repoPath string, args ...string) CommandResult
	RunGitRaw(repoPath string, args ...string) ([]byte, error)
	RunGitWithStdin(repoPath string, stdinInput string, args ...string) CommandResult
}

type unmergedStage struct {
	stage int
	mode  string
	oid   string
}

type unmergedPath struct {
	path   string
	stages map[int]unmergedStage
}

var conflictImageExtensions = map[string]struct{}{
	".png": {}, ".jpg": {}, ".jpeg": {}, ".gif": {}, ".bmp": {},
	".webp": {}, ".tif": {}, ".tiff": {}, ".ico": {},
}

// classifyConflictQueue scans the repository's unmerged index entries and
// returns them sorted by path with classification applied.
func classifyConflictQueue(git conflictQueueGit, repoPath string) ([]ConflictQueueEntry, error) {
	result := git.RunGit(repoPath, "ls-files", "-u", "-z")
	if !result.Success {
		return nil, fmt.Errorf("failed to list unmerged files: %s", getErrorMessage(result))
	}

	paths, err := parseUnmergedEntries(result.Stdout)
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return []ConflictQueueEntry{}, nil
	}

	sizes := lookupBlobSizes(git, repoPath, paths)

	entries := make([]ConflictQueueEntry, 0, len(paths))
	for _, path := range paths {
		entries = append(entries, classifyUnmergedPath(git, repoPath, path, sizes))
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, nil
}

// parseUnmergedEntries turns `git ls-files -u -z` output into per-path stage
// sets, preserving nothing about git's ordering.
func parseUnmergedEntries(output string) ([]unmergedPath, error) {
	byPath := make(map[string]*unmergedPath)
	order := []string{}

	for _, record := range strings.Split(output, "\x00") {
		if record == "" {
			continue
		}

		header, path, found := strings.Cut(record, "\t")
		if !found || path == "" {
			return nil, fmt.Errorf("git returned an invalid unmerged entry")
		}

		fields := strings.Fields(header)
		if len(fields) != unmergedRecordFields {
			return nil, fmt.Errorf("git returned an invalid unmerged entry")
		}

		stage, parseErr := strconv.Atoi(fields[2])
		if parseErr != nil || stage < conflictStageBase || stage > conflictStageTheirs {
			return nil, fmt.Errorf("git returned an invalid unmerged stage number")
		}

		entry, exists := byPath[path]
		if !exists {
			entry = &unmergedPath{path: path, stages: make(map[int]unmergedStage, 3)}
			byPath[path] = entry
			order = append(order, path)
		}
		entry.stages[stage] = unmergedStage{stage: stage, mode: fields[0], oid: fields[1]}
	}

	paths := make([]unmergedPath, 0, len(order))
	for _, path := range order {
		paths = append(paths, *byPath[path])
	}
	return paths, nil
}

// lookupBlobSizes resolves every referenced blob size in a single
// `git cat-file --batch-check` call. A failed lookup yields no entry, and the
// caller treats an unknown size as unsafe.
func lookupBlobSizes(git conflictQueueGit, repoPath string, paths []unmergedPath) map[string]int64 {
	oids := make([]string, 0, len(paths)*3)
	seen := make(map[string]struct{}, len(paths)*3)
	for _, path := range paths {
		for _, stage := range path.stages {
			if stage.oid == "" {
				continue
			}
			if _, exists := seen[stage.oid]; exists {
				continue
			}
			seen[stage.oid] = struct{}{}
			oids = append(oids, stage.oid)
		}
	}

	sizes := make(map[string]int64, len(oids))
	if len(oids) == 0 {
		return sizes
	}

	result := git.RunGitWithStdin(repoPath, strings.Join(oids, "\n")+"\n", "cat-file", "--batch-check")
	if !result.Success {
		return sizes
	}

	for _, line := range strings.Split(result.Stdout, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) != 3 || fields[1] != "blob" {
			continue
		}
		size, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil {
			continue
		}
		sizes[fields[0]] = size
	}
	return sizes
}

func classifyUnmergedPath(git conflictQueueGit, repoPath string, path unmergedPath, sizes map[string]int64) ConflictQueueEntry {
	_, hasBase := path.stages[conflictStageBase]
	_, hasOurs := path.stages[conflictStageOurs]
	_, hasTheirs := path.stages[conflictStageTheirs]

	entry := ConflictQueueEntry{
		Path:      path.path,
		Kind:      conflictKindFromStages(hasBase, hasOurs, hasTheirs),
		HasBase:   hasBase,
		HasOurs:   hasOurs,
		HasTheirs: hasTheirs,
		SizeBytes: largestStageSize(path, sizes),
	}

	entry.FileKind, entry.Eligibility, entry.IneligibleReason = classifyConflictContent(git, repoPath, path, sizes, entry.SizeBytes)
	return entry
}

func conflictKindFromStages(hasBase bool, hasOurs bool, hasTheirs bool) ConflictKind {
	switch {
	case hasBase && hasOurs && hasTheirs:
		return ConflictKindBothModified
	case !hasBase && hasOurs && hasTheirs:
		return ConflictKindBothAdded
	case hasBase && hasOurs && !hasTheirs:
		return ConflictKindDeletedByThem
	case hasBase && !hasOurs && hasTheirs:
		return ConflictKindDeletedByUs
	case !hasBase && hasOurs && !hasTheirs:
		return ConflictKindAddedByUs
	case !hasBase && !hasOurs && hasTheirs:
		return ConflictKindAddedByThem
	case hasBase && !hasOurs && !hasTheirs:
		return ConflictKindBothDeleted
	default:
		return ConflictKindUnknown
	}
}

func classifyConflictContent(
	git conflictQueueGit,
	repoPath string,
	path unmergedPath,
	sizes map[string]int64,
	largestSize int64,
) (ConflictFileKind, ConflictEligibility, string) {
	if hasStageMode(path, gitlinkFileMode) {
		return ConflictFileKindSubmodule, ConflictIneligible, ConflictReasonSubmodule
	}
	if hasStageMode(path, symlinkFileMode) {
		return ConflictFileKindSymlink, ConflictIneligible, ConflictReasonSymlink
	}
	if unsupported := firstUnsupportedQueueMode(path); unsupported != "" {
		return ConflictFileKindUnknown, ConflictIneligible, ConflictReasonUnsupportedMode
	}

	extensionKind := conflictFileKindFromExtension(path.path)
	if extensionKind == ConflictFileKindImage {
		return ConflictFileKindImage, ConflictIneligible, ConflictReasonImage
	}

	if largestSize > conflictQueueBlobSizeLimit || !allStageSizesKnown(path, sizes) {
		kind := extensionKind
		if kind == ConflictFileKindUnknown {
			kind = ConflictFileKindText
		}
		return kind, ConflictIneligible, ConflictReasonTooLarge
	}

	sample, sampled := sniffPreferredStage(git, repoPath, path)
	if sampled && !isConflictQueueText(sample) {
		if extensionKind == ConflictFileKindL5X {
			return ConflictFileKindL5X, ConflictIneligible, ConflictReasonNotUTF8
		}
		return ConflictFileKindBinary, ConflictIneligible, ConflictReasonBinary
	}

	kind := extensionKind
	if kind == ConflictFileKindUnknown {
		kind = ConflictFileKindText
	}

	if !path.hasStage(conflictStageOurs) || !path.hasStage(conflictStageTheirs) {
		return kind, ConflictIneligible, ConflictReasonOneSided
	}
	return kind, ConflictEligible, ""
}

func (p unmergedPath) hasStage(stage int) bool {
	_, exists := p.stages[stage]
	return exists
}

func hasStageMode(path unmergedPath, mode string) bool {
	for stage := conflictStageBase; stage <= conflictStageTheirs; stage++ {
		if entry, exists := path.stages[stage]; exists && entry.mode == mode {
			return true
		}
	}
	return false
}

func firstUnsupportedQueueMode(path unmergedPath) string {
	for stage := conflictStageBase; stage <= conflictStageTheirs; stage++ {
		entry, exists := path.stages[stage]
		if !exists {
			continue
		}
		if entry.mode != regularFileMode && entry.mode != executableFileMode {
			return entry.mode
		}
	}
	return ""
}

func conflictFileKindFromExtension(path string) ConflictFileKind {
	extension := strings.ToLower(filepath.Ext(path))
	if extension == ".l5x" {
		return ConflictFileKindL5X
	}
	if _, isImage := conflictImageExtensions[extension]; isImage {
		return ConflictFileKindImage
	}
	return ConflictFileKindUnknown
}

func largestStageSize(path unmergedPath, sizes map[string]int64) int64 {
	var largest int64
	for _, stage := range path.stages {
		if size, known := sizes[stage.oid]; known && size > largest {
			largest = size
		}
	}
	return largest
}

func allStageSizesKnown(path unmergedPath, sizes map[string]int64) bool {
	for _, stage := range path.stages {
		if stage.oid == "" {
			return false
		}
		if _, known := sizes[stage.oid]; !known {
			return false
		}
	}
	return true
}

// sniffPreferredStage reads a bounded prefix of the most representative
// available stage: ours, then theirs, then base.
func sniffPreferredStage(git conflictQueueGit, repoPath string, path unmergedPath) ([]byte, bool) {
	for _, stage := range []int{conflictStageOurs, conflictStageTheirs, conflictStageBase} {
		entry, exists := path.stages[stage]
		if !exists || entry.oid == "" {
			continue
		}
		content, err := git.RunGitRaw(repoPath, "cat-file", "blob", entry.oid)
		if err != nil {
			continue
		}
		if len(content) > conflictQueueSniffLimit {
			content = content[:conflictQueueSniffLimit]
		}
		return content, true
	}
	return nil, false
}

// isConflictQueueText treats content as text when it holds no NUL byte and
// decodes as UTF-8. A trailing partial rune from the sniff cut is tolerated.
func isConflictQueueText(sample []byte) bool {
	if len(sample) == 0 {
		return true
	}
	for _, b := range sample {
		if b == 0x00 {
			return false
		}
	}

	sample = trimConflictQueueBOM(sample)
	for len(sample) > 0 {
		r, size := utf8.DecodeRune(sample)
		if r == utf8.RuneError && size == 1 {
			// A truncated rune at the very end is an artifact of sniffing.
			return len(sample) < utf8.UTFMax
		}
		sample = sample[size:]
	}
	return true
}

// trimConflictQueueBOM removes a leading UTF-8 byte order mark. Kept local so
// the queue has no dependency on the legacy conflict resolution helpers.
func trimConflictQueueBOM(content []byte) []byte {
	if len(content) >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF {
		return content[3:]
	}
	return content
}
