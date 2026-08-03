package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	conflictBlobSizeLimit   = 2 * 1024 * 1024
	conflictOutputSizeLimit = 4 * 1024 * 1024
	conflictMarkerSize      = 32
)

type ConflictFileStatus string

const (
	ConflictStatusBothModified  ConflictFileStatus = "both-modified"
	ConflictStatusBothAdded     ConflictFileStatus = "both-added"
	ConflictStatusBothDeleted   ConflictFileStatus = "both-deleted"
	ConflictStatusDeletedByUs   ConflictFileStatus = "deleted-by-us"
	ConflictStatusDeletedByThem ConflictFileStatus = "deleted-by-them"
)

type ConflictIneligibleReason string

const (
	ConflictReasonNone                ConflictIneligibleReason = ""
	ConflictReasonUnsafeFileType      ConflictIneligibleReason = "unsafe-file-type"
	ConflictReasonMissingSide         ConflictIneligibleReason = "missing-side"
	ConflictReasonFileTooLarge        ConflictIneligibleReason = "file-too-large"
	ConflictReasonBinaryContent       ConflictIneligibleReason = "binary-content"
	ConflictReasonUnsupportedEncoding ConflictIneligibleReason = "unsupported-encoding"
	ConflictReasonUnsupportedContent  ConflictIneligibleReason = "unsupported-content"
	ConflictReasonLineEndingMismatch  ConflictIneligibleReason = "line-ending-mismatch"
	ConflictReasonGenerationFailed    ConflictIneligibleReason = "conflict-generation-failed"
	ConflictReasonOutputTooLarge      ConflictIneligibleReason = "output-too-large"
)

type ConflictBlob struct {
	Present bool   `json:"present"`
	OID     string `json:"oid,omitempty"`
	Mode    string `json:"mode,omitempty"`
	Content string `json:"content,omitempty"`
}

type ConflictRegion struct {
	ID       string   `json:"id"`
	Current  []string `json:"current"`
	Base     []string `json:"base,omitempty"`
	Incoming []string `json:"incoming"`
}

type ConflictSegment struct {
	Kind     string          `json:"kind"`
	Text     string          `json:"text,omitempty"`
	Conflict *ConflictRegion `json:"conflict,omitempty"`
}

type ConflictResolutionData struct {
	Success          bool                     `json:"success"`
	Path             string                   `json:"path"`
	Status           ConflictFileStatus       `json:"status"`
	Eligible         bool                     `json:"eligible"`
	IneligibleReason ConflictIneligibleReason `json:"ineligibleReason,omitempty"`
	Base             ConflictBlob             `json:"base"`
	Current          ConflictBlob             `json:"current"`
	Incoming         ConflictBlob             `json:"incoming"`
	Segments         []ConflictSegment        `json:"segments,omitempty"`
	ResolutionToken  string                   `json:"resolutionToken,omitempty"`
	Newline          string                   `json:"newline,omitempty"`
	HasFinalNewline  bool                     `json:"hasFinalNewline"`
	Error            string                   `json:"error,omitempty"`
}

type conflictStageEntry struct {
	stage int
	mode  string
	oid   string
}

func (g *GitService) GetConflictResolutionData(repoPath string, filePath string) ConflictResolutionData {
	data := ConflictResolutionData{Path: normalizeMergePath(filePath)}
	state := g.GetMergeState(repoPath)
	if !state.InMerge && !state.InSquashMerge && !state.InCherryPick && !state.InRevert {
		data.Error = "No supported conflict operation is in progress"
		return data
	}

	if _, err := safeRepoRelativePath(repoPath, data.Path); err != nil {
		data.Error = "Invalid conflict path"
		return data
	}

	entries, err := g.loadConflictStageEntries(repoPath, data.Path)
	if err != nil {
		data.Error = err.Error()
		return data
	}
	if len(entries) == 0 {
		data.Error = "The file is no longer conflicted"
		return data
	}

	data.Status = conflictStatus(entries)
	data.ResolutionToken = conflictResolutionToken(data.Path, entries)
	if unsafeMode := firstUnsafeConflictMode(entries); unsafeMode != "" {
		data.Base = conflictBlobMetadata(entries[1])
		data.Current = conflictBlobMetadata(entries[2])
		data.Incoming = conflictBlobMetadata(entries[3])
		data.Success = true
		data.IneligibleReason = ConflictReasonUnsafeFileType
		return data
	}
	if g.conflictBlobExceedsLimit(repoPath, entries[1]) || g.conflictBlobExceedsLimit(repoPath, entries[2]) || g.conflictBlobExceedsLimit(repoPath, entries[3]) {
		data.Base = conflictBlobMetadata(entries[1])
		data.Current = conflictBlobMetadata(entries[2])
		data.Incoming = conflictBlobMetadata(entries[3])
		data.Success = true
		data.IneligibleReason = ConflictReasonFileTooLarge
		return data
	}
	if data.Base, err = g.loadConflictBlob(repoPath, entries[1]); err != nil {
		data.Error = err.Error()
		return data
	}
	if data.Current, err = g.loadConflictBlob(repoPath, entries[2]); err != nil {
		data.Error = err.Error()
		return data
	}
	if data.Incoming, err = g.loadConflictBlob(repoPath, entries[3]); err != nil {
		data.Error = err.Error()
		return data
	}
	data.Success = true

	if !data.Current.Present || !data.Incoming.Present {
		data.IneligibleReason = ConflictReasonMissingSide
		return data
	}
	for _, blob := range []ConflictBlob{data.Base, data.Current, data.Incoming} {
		if !blob.Present {
			continue
		}
		content := []byte(blob.Content)
		if len(content) > conflictBlobSizeLimit {
			data.IneligibleReason = ConflictReasonFileTooLarge
			return data
		}
		if bytes.IndexByte(content, 0) >= 0 {
			data.IneligibleReason = ConflictReasonBinaryContent
			return data
		}
		if !validUTF8WithOptionalBOM(content) {
			data.IneligibleReason = ConflictReasonUnsupportedEncoding
			return data
		}
		if !isConservativeText(content) {
			data.IneligibleReason = ConflictReasonUnsupportedContent
			return data
		}
	}
	if hasFinalNewline(data.Current.Content) != hasFinalNewline(data.Incoming.Content) {
		data.IneligibleReason = ConflictReasonLineEndingMismatch
		return data
	}

	segments, mergedOutput, err := g.generateConflictSegments(repoPath, data)
	if err != nil {
		data.IneligibleReason = ConflictReasonGenerationFailed
		return data
	}
	if len(mergedOutput) > conflictOutputSizeLimit {
		data.IneligibleReason = ConflictReasonOutputTooLarge
		return data
	}
	data.Newline = detectConflictNewline(mergedOutput, data.Current.Content, data.Incoming.Content, data.Base.Content)
	data.HasFinalNewline = hasFinalNewline(data.Current.Content)
	data.Segments = segments
	data.Eligible = true
	return data
}

func (g *GitService) ResolveConflictWithContent(repoPath string, filePath string, resolutionToken string, content string) OperationResult {
	normalizedPath := normalizeMergePath(filePath)
	destination, err := safeConflictDestination(repoPath, normalizedPath)
	if err != nil {
		return failedOp("Invalid conflict path")
	}
	state := g.GetMergeState(repoPath)
	if !state.InMerge && !state.InSquashMerge && !state.InCherryPick && !state.InRevert {
		return failedOp("No supported conflict operation is in progress")
	}
	entries, err := g.loadConflictStageEntries(repoPath, normalizedPath)
	if err != nil || len(entries) == 0 {
		return failedOp("The file is no longer conflicted")
	}
	if conflictResolutionToken(normalizedPath, entries) != resolutionToken {
		return failedOp("This conflict changed after it was opened. Reload it before resolving.")
	}
	if unsafeMode := firstUnsafeConflictMode(entries); unsafeMode != "" {
		return failedOp(unsupportedConflictModeMessage(unsafeMode))
	}
	contentBytes := []byte(content)
	if len(contentBytes) > conflictOutputSizeLimit {
		return failedOp("Resolved content is too large")
	}
	if bytes.IndexByte(contentBytes, 0) >= 0 || !utf8.Valid(contentBytes) {
		return failedOp("Resolved content must be valid UTF-8 text")
	}

	mode := os.FileMode(0644)
	if current, ok := entries[2]; ok && current.mode == "100755" {
		mode = 0755
	}
	if err = writeResolvedConflictFile(destination, contentBytes, mode); err != nil {
		return failedOp("Failed to write resolved file: " + err.Error())
	}

	addResult := g.runner.RunGit(repoPath, "add", "--", normalizedPath)
	if !addResult.Success {
		return failedOp("The resolved file was written, but could not be staged. Retry Resolve File. " + getErrorMessage(addResult))
	}
	return successOp(fmt.Sprintf("Resolved '%s'", normalizedPath))
}

func (g *GitService) resolveConflictWithStage(repoPath string, filePath string, stage int, sideName string) OperationResult {
	normalizedPath := normalizeMergePath(filePath)
	destination, err := safeConflictDestination(repoPath, normalizedPath)
	if err != nil {
		return failedOp("Invalid conflict path")
	}
	state := g.GetMergeState(repoPath)
	if !state.InMerge && !state.InSquashMerge && !state.InCherryPick && !state.InRevert && !state.InRebase {
		return failedOp("No merge in progress - cannot resolve conflict")
	}
	entries, err := g.loadConflictStageEntries(repoPath, normalizedPath)
	if err != nil || len(entries) == 0 {
		return failedOp("The file is no longer conflicted")
	}
	if unsafeMode := firstUnsafeConflictMode(entries); unsafeMode != "" {
		return failedOp(unsupportedConflictModeMessage(unsafeMode))
	}
	entry, present := entries[stage]
	if !present {
		if removeErr := os.Remove(destination); removeErr != nil && !os.IsNotExist(removeErr) {
			return failedOp("Failed to apply the selected deletion: " + removeErr.Error())
		}
		result := g.runner.RunGit(repoPath, "rm", "--cached", "--ignore-unmatch", "--", normalizedPath)
		if !result.Success {
			return failedOp("Failed to stage the selected deletion: " + getErrorMessage(result))
		}
		return successOp(fmt.Sprintf("Resolved '%s' by keeping the %s file", normalizedPath, sideName))
	}

	content, err := g.runner.RunGitRaw(repoPath, "cat-file", "blob", entry.oid)
	if err != nil {
		return failedOp("Failed to read the selected file version")
	}
	mode := os.FileMode(0644)
	if entry.mode == "100755" {
		mode = 0755
	}
	if err := writeResolvedConflictFile(destination, content, mode); err != nil {
		return failedOp("Failed to write the selected file version: " + err.Error())
	}
	result := g.runner.RunGit(repoPath, "add", "--", normalizedPath)
	if !result.Success {
		return failedOp("Failed to stage resolved file: " + getErrorMessage(result))
	}
	return successOp(fmt.Sprintf("Resolved '%s' by keeping the %s file", normalizedPath, sideName))
}

func safeConflictDestination(repoPath string, relativePath string) (string, error) {
	destination, err := safeRepoRelativePath(repoPath, relativePath)
	if err != nil {
		return "", err
	}
	realRepo, err := filepath.EvalSymlinks(repoPath)
	if err != nil {
		return "", err
	}
	realParent, err := filepath.EvalSymlinks(filepath.Dir(destination))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(realRepo, realParent)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes repository through a symbolic link")
	}
	return destination, nil
}

func writeResolvedConflictFile(destination string, content []byte, mode os.FileMode) error {
	if info, statErr := os.Lstat(destination); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("cannot replace a symbolic link while resolving a conflict")
	}
	temporary, err := os.CreateTemp(filepath.Dir(destination), ".controlzebra-conflict-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err = temporary.Chmod(mode); err == nil {
		_, err = temporary.Write(content)
	}
	if err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = replaceFileAtomic(temporaryPath, destination)
	}
	return err
}

func (g *GitService) loadConflictStageEntries(repoPath string, filePath string) (map[int]conflictStageEntry, error) {
	result := g.runner.RunGit(repoPath, "ls-files", "-u", "-z", "--", filePath)
	if !result.Success {
		return nil, fmt.Errorf("failed to read conflict stages: %s", getErrorMessage(result))
	}
	entries := make(map[int]conflictStageEntry)
	for _, record := range strings.Split(result.Stdout, "\x00") {
		if record == "" {
			continue
		}
		header, _, found := strings.Cut(record, "\t")
		fields := strings.Fields(header)
		if !found || len(fields) != 3 {
			return nil, fmt.Errorf("Git returned an invalid conflict stage entry")
		}
		stage, parseErr := strconv.Atoi(fields[2])
		if parseErr != nil || stage < 1 || stage > 3 {
			return nil, fmt.Errorf("Git returned an invalid conflict stage number")
		}
		entries[stage] = conflictStageEntry{stage: stage, mode: fields[0], oid: fields[1]}
	}
	return entries, nil
}

func (g *GitService) loadConflictBlob(repoPath string, entry conflictStageEntry) (ConflictBlob, error) {
	if entry.oid == "" {
		return ConflictBlob{}, nil
	}
	content, err := g.runner.RunGitRaw(repoPath, "cat-file", "blob", entry.oid)
	if err != nil {
		return ConflictBlob{}, fmt.Errorf("failed to read conflict content")
	}
	return ConflictBlob{Present: true, OID: entry.oid, Mode: entry.mode, Content: string(content)}, nil
}

func (g *GitService) conflictBlobExceedsLimit(repoPath string, entry conflictStageEntry) bool {
	if entry.oid == "" {
		return false
	}
	result := g.runner.RunGit(repoPath, "cat-file", "-s", entry.oid)
	if !result.Success {
		return true
	}
	size, err := strconv.ParseInt(strings.TrimSpace(result.Stdout), 10, 64)
	return err != nil || size > conflictBlobSizeLimit
}

func conflictBlobMetadata(entry conflictStageEntry) ConflictBlob {
	if entry.oid == "" {
		return ConflictBlob{}
	}
	return ConflictBlob{Present: true, OID: entry.oid, Mode: entry.mode}
}

func firstUnsafeConflictMode(entries map[int]conflictStageEntry) string {
	for stage := 1; stage <= 3; stage++ {
		entry, present := entries[stage]
		if present && entry.mode != "100644" && entry.mode != "100755" {
			return entry.mode
		}
	}
	return ""
}

func unsupportedConflictModeMessage(mode string) string {
	switch mode {
	case "120000":
		return "Symbolic link conflicts cannot be resolved as files. Use the repository recovery tools."
	case "160000":
		return "Submodule conflicts cannot be resolved as files. Use the repository recovery tools."
	default:
		return "This conflict uses an unsupported file type. Use the repository recovery tools."
	}
}

func conflictStatus(entries map[int]conflictStageEntry) ConflictFileStatus {
	_, base := entries[1]
	_, current := entries[2]
	_, incoming := entries[3]
	switch {
	case !base && current && incoming:
		return ConflictStatusBothAdded
	case base && !current && !incoming:
		return ConflictStatusBothDeleted
	case base && !current && incoming:
		return ConflictStatusDeletedByUs
	case base && current && !incoming:
		return ConflictStatusDeletedByThem
	default:
		return ConflictStatusBothModified
	}
}

func conflictResolutionToken(path string, entries map[int]conflictStageEntry) string {
	hash := sha256.New()
	_, _ = fmt.Fprintf(hash, "%s\x00", path)
	for stage := 1; stage <= 3; stage++ {
		entry := entries[stage]
		_, _ = fmt.Fprintf(hash, "%d\x00%s\x00%s\x00", stage, entry.mode, entry.oid)
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func (g *GitService) generateConflictSegments(repoPath string, data ConflictResolutionData) ([]ConflictSegment, string, error) {
	temporaryDir, err := os.MkdirTemp("", "controlzebra-merge-file-*")
	if err != nil {
		return nil, "", err
	}
	defer os.RemoveAll(temporaryDir)

	currentPath := filepath.Join(temporaryDir, "current")
	basePath := filepath.Join(temporaryDir, "base")
	incomingPath := filepath.Join(temporaryDir, "incoming")
	if err := os.WriteFile(currentPath, stripUTF8BOM([]byte(data.Current.Content)), 0600); err != nil {
		return nil, "", err
	}
	if err := os.WriteFile(basePath, stripUTF8BOM([]byte(data.Base.Content)), 0600); err != nil {
		return nil, "", err
	}
	if err := os.WriteFile(incomingPath, stripUTF8BOM([]byte(data.Incoming.Content)), 0600); err != nil {
		return nil, "", err
	}

	labelToken := data.ResolutionToken[:16]
	currentLabel := "CONTROLZEBRA_CURRENT_" + labelToken
	baseLabel := "CONTROLZEBRA_BASE_" + labelToken
	incomingLabel := "CONTROLZEBRA_INCOMING_" + labelToken
	for _, content := range []string{data.Base.Content, data.Current.Content, data.Incoming.Content} {
		if strings.Contains(content, currentLabel) || strings.Contains(content, baseLabel) || strings.Contains(content, incomingLabel) {
			return nil, "", fmt.Errorf("conflict marker collision")
		}
	}

	result := g.runner.RunGit(repoPath, "merge-file", "-p", "--diff3", fmt.Sprintf("--marker-size=%d", conflictMarkerSize),
		"-L", currentLabel, "-L", baseLabel, "-L", incomingLabel, currentPath, basePath, incomingPath)
	if !result.Success && (result.ExitCode < 0 || result.ExitCode > 127) {
		return nil, "", fmt.Errorf("Git could not generate conflict regions: %s", getErrorMessage(result))
	}
	mergedOutput := result.Stdout
	if hasUTF8BOM([]byte(data.Current.Content)) {
		mergedOutput = "\ufeff" + mergedOutput
	}
	segments, err := parseConflictSegments(mergedOutput, currentLabel, baseLabel, incomingLabel)
	return segments, mergedOutput, err
}

func parseConflictSegments(output string, currentLabel string, baseLabel string, incomingLabel string) ([]ConflictSegment, error) {
	currentMarker := strings.Repeat("<", conflictMarkerSize) + " " + currentLabel
	baseMarker := strings.Repeat("|", conflictMarkerSize) + " " + baseLabel
	separator := strings.Repeat("=", conflictMarkerSize)
	incomingMarker := strings.Repeat(">", conflictMarkerSize) + " " + incomingLabel
	leadingBOM := ""
	if strings.HasPrefix(output, "\ufeff") {
		leadingBOM = "\ufeff"
		output = strings.TrimPrefix(output, leadingBOM)
	}
	lines := splitLinesRetainingEndings(output)
	segments := make([]ConflictSegment, 0)
	regionCount := 0
	var context strings.Builder
	context.WriteString(leadingBOM)
	flushContext := func() {
		if context.Len() > 0 {
			segments = append(segments, ConflictSegment{Kind: "context", Text: context.String()})
			context.Reset()
		}
	}

	for index := 0; index < len(lines); {
		if trimLineEnding(lines[index]) != currentMarker {
			context.WriteString(lines[index])
			index++
			continue
		}
		flushContext()
		index++
		region := ConflictRegion{ID: fmt.Sprintf("conflict-%d", regionCount+1)}
		var destination *[]string = &region.Current
		for index < len(lines) {
			marker := trimLineEnding(lines[index])
			switch marker {
			case baseMarker:
				destination = &region.Base
				index++
			case separator:
				destination = &region.Incoming
				index++
			case incomingMarker:
				index++
				segments = append(segments, ConflictSegment{Kind: "conflict", Conflict: &region})
				regionCount++
				destination = nil
			default:
				*destination = append(*destination, trimLineEnding(lines[index]))
				index++
			}
			if destination == nil {
				break
			}
		}
		if destination != nil {
			return nil, fmt.Errorf("unterminated conflict region")
		}
	}
	flushContext()
	if regionCount == 0 {
		return nil, fmt.Errorf("Git produced no conflict regions")
	}
	return segments, nil
}

func splitLinesRetainingEndings(content string) []string {
	if content == "" {
		return nil
	}
	lines := make([]string, 0, strings.Count(content, "\n")+1)
	for len(content) > 0 {
		index := strings.IndexByte(content, '\n')
		if index < 0 {
			lines = append(lines, content)
			break
		}
		lines = append(lines, content[:index+1])
		content = content[index+1:]
	}
	return lines
}

func trimLineEnding(line string) string {
	return strings.TrimSuffix(strings.TrimSuffix(line, "\n"), "\r")
}

func validUTF8WithOptionalBOM(content []byte) bool {
	content = stripUTF8BOM(content)
	return utf8.Valid(content)
}

func hasUTF8BOM(content []byte) bool {
	return bytes.HasPrefix(content, []byte{0xef, 0xbb, 0xbf})
}

func stripUTF8BOM(content []byte) []byte {
	return bytes.TrimPrefix(content, []byte{0xef, 0xbb, 0xbf})
}

func isConservativeText(content []byte) bool {
	content = stripUTF8BOM(content)
	for _, value := range content {
		if value < 0x20 && value != '\t' && value != '\n' && value != '\r' && value != '\f' {
			return false
		}
	}
	return true
}

func detectConflictNewline(contents ...string) string {
	for _, content := range contents {
		if strings.Contains(content, "\r\n") {
			return "\r\n"
		}
		if strings.Contains(content, "\n") {
			return "\n"
		}
	}
	return "\n"
}

func hasFinalNewline(content string) bool {
	return strings.HasSuffix(content, "\n")
}
