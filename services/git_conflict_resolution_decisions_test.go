package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveConflictWithDecisionsComposesServerSide(t *testing.T) {
	base := []byte("line 1\nbase choice\nline 3\n")
	current := []byte("line 1\ncurrent choice\nline 3\n")
	incoming := []byte("line 1\nincoming choice\nline 3\n")
	repoPath := createTextConflictRepo(t, "control.txt", base, current, incoming)
	defer cleanupTestRepo(t, repoPath)

	service := NewGitService()
	data := service.GetConflictResolutionData(repoPath, "control.txt")
	if !data.Success || !data.Eligible || len(data.Regions) != 1 {
		t.Fatalf("expected one eligible region, got %#v", data)
	}

	undecided := service.ResolveConflictWithDecisions(repoPath, "control.txt", data.ResolutionToken, nil)
	if undecided.Success || !strings.Contains(undecided.Error, "every conflict") {
		t.Fatalf("expected undecided rejection, got %#v", undecided)
	}

	unknown := service.ResolveConflictWithDecisions(repoPath, "control.txt", data.ResolutionToken,
		[]ConflictDecision{{RegionID: "conflict-99", Mode: "block", Side: "current"}})
	if unknown.Success || !strings.Contains(unknown.Error, "changed after it was opened") {
		t.Fatalf("expected unknown region rejection, got %#v", unknown)
	}

	stale := service.ResolveConflictWithDecisions(repoPath, "control.txt", "not-the-token",
		[]ConflictDecision{{RegionID: data.Regions[0].ID, Mode: "block", Side: "incoming"}})
	if stale.Success || !strings.Contains(stale.Error, "changed after it was opened") {
		t.Fatalf("expected stale token rejection, got %#v", stale)
	}

	result := service.ResolveConflictWithDecisions(repoPath, "control.txt", data.ResolutionToken,
		[]ConflictDecision{{RegionID: data.Regions[0].ID, Mode: "block", Side: "incoming"}})
	if !result.Success {
		t.Fatalf("failed to resolve with decisions: %s", result.Error)
	}

	written, err := os.ReadFile(filepath.Join(repoPath, "control.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(written) != string(incoming) {
		t.Fatalf("unexpected composed content: %q", written)
	}
	if unmerged := strings.TrimSpace(runGitOutput(t, repoPath, "ls-files", "-u", "--", "control.txt")); unmerged != "" {
		t.Fatalf("expected conflict stages to be cleared, got %q", unmerged)
	}
}

func TestResolveConflictWithDecisionsRejectsMalformedL5X(t *testing.T) {
	base := []byte("<RSLogix5000Content>\n<Rung Number=\"0\">\n<Text>base</Text>\n</Rung>\n</RSLogix5000Content>\n")
	current := []byte("<RSLogix5000Content>\n<Rung Number=\"1\">\n<Text>current</Text>\n</Rung>\n</RSLogix5000Content>\n")
	incoming := []byte("<RSLogix5000Content>\n<Rung Number=\"2\">\n<Text>incoming</Text>\n</Rung>\n</RSLogix5000Content>\n")
	repoPath := createTextConflictRepo(t, "routine.l5x", base, current, incoming)
	defer cleanupTestRepo(t, repoPath)

	service := NewGitService()
	data := service.GetConflictResolutionData(repoPath, "routine.l5x")
	if !data.Success || !data.Eligible || len(data.Regions) == 0 {
		t.Fatalf("expected eligible L5X conflict data, got %#v", data)
	}

	region := data.Regions[0]
	// Drop the line carrying the <Rung> opening tag so the surrounding </Rung>
	// context is left stranded and the composed document is unbalanced.
	rungLineIndex := -1
	for index, line := range region.Current {
		if strings.Contains(line, "<Rung") {
			rungLineIndex = index
			break
		}
	}
	if rungLineIndex < 0 || len(region.Current) < 2 {
		t.Fatalf("expected the conflict region to span the rung opening tag, got %#v", region.Current)
	}
	currentLines := make([]bool, len(region.Current))
	for index := range currentLines {
		currentLines[index] = index != rungLineIndex
	}

	broken := service.ResolveConflictWithDecisions(repoPath, "routine.l5x", data.ResolutionToken,
		[]ConflictDecision{{
			RegionID:      region.ID,
			Mode:          "lines",
			CurrentLines:  currentLines,
			IncomingLines: make([]bool, len(region.Incoming)),
		}})
	if broken.Success || !strings.Contains(broken.Error, "well-formed L5X") {
		t.Fatalf("expected malformed L5X rejection, got %#v", broken)
	}

	ok := service.ResolveConflictWithDecisions(repoPath, "routine.l5x", data.ResolutionToken,
		[]ConflictDecision{{RegionID: region.ID, Mode: "block", Side: "current"}})
	if !ok.Success {
		t.Fatalf("expected whole-region choice to resolve, got %#v", ok)
	}
}

func TestConflictRegionContextIsTrimmed(t *testing.T) {
	var baseBuilder, currentBuilder, incomingBuilder strings.Builder
	for index := 0; index < 200; index++ {
		line := "context line\n"
		baseBuilder.WriteString(line)
		currentBuilder.WriteString(line)
		incomingBuilder.WriteString(line)
	}
	baseBuilder.WriteString("base tail\n")
	currentBuilder.WriteString("current tail\n")
	incomingBuilder.WriteString("incoming tail\n")

	repoPath := createTextConflictRepo(t, "long.txt",
		[]byte(baseBuilder.String()), []byte(currentBuilder.String()), []byte(incomingBuilder.String()))
	defer cleanupTestRepo(t, repoPath)

	data := NewGitService().GetConflictResolutionData(repoPath, "long.txt")
	if !data.Success || !data.Eligible || len(data.Regions) != 1 {
		t.Fatalf("expected one eligible region, got %#v", data)
	}
	contextLines := strings.Count(data.Regions[0].ContextBefore, "\n")
	if contextLines > conflictContextLineLimit {
		t.Fatalf("expected context trimmed to %d lines, got %d", conflictContextLineLimit, contextLines)
	}
	if contextLines == 0 {
		t.Fatal("expected some surrounding context to be sent")
	}
}

func TestIsWellFormedXMLStreamsWithoutTree(t *testing.T) {
	tests := []struct {
		name    string
		content string
		valid   bool
	}{
		{name: "balanced", content: "<Root><Child/></Root>", valid: true},
		{name: "declared encoding", content: "<?xml version=\"1.0\" encoding=\"windows-1252\"?><Root/>", valid: true},
		{name: "leading BOM", content: "\ufeff<Root/>", valid: true},
		{name: "unclosed", content: "<Root><Child></Root>", valid: false},
		{name: "truncated", content: "<Root>", valid: false},
		{name: "fragment only", content: "</Root>", valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isWellFormedXML([]byte(test.content)); got != test.valid {
				t.Fatalf("isWellFormedXML(%q) = %v, want %v", test.content, got, test.valid)
			}
		})
	}
}
