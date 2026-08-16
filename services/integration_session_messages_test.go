package services

import (
	"regexp"
	"strings"
	"testing"
)

// Phase 0 of the Isolated Conflict Resolution Plan locks down the wording for
// every outcome the isolated integration workflow can report, before any
// service exists to report them. Phase 2 moves this map into the service; until
// then it lives in a test file so Phase 0 writes no production code.
//
// Every message is two parts: what happened, then a concrete next step.
var integrationSessionOutcomeMessages = map[string]string{
	"scheduled": "Your saved work is queued for a compatibility check. Keep working, and we'll tell you when it finishes.",

	"preparing": "We're checking your saved work against the shared project. Keep working, nothing in your project is being changed.",

	"needs-decisions": "Some files were changed in both your work and the shared project. Open Conflict Review to pick which version to keep for each file.",

	"ready": "Your work is ready to be combined with the shared project. Choose Finish when you want to send it.",

	"blocked": "Your work is ready, but this project has unsaved files that would be replaced. Save or discard those files, then choose Finish again.",

	"obsolete": "Your saved work changed, so Conflict Review was refreshed. Review the latest files before finishing.",

	"failed": "The compatibility check couldn't finish, and nothing in your project was changed. Try again, and contact support if it keeps failing.",

	"cancelled": "Conflict Review was cancelled and your decisions were deleted. Nothing in your project or the shared project changed.",

	"recovered": "ControlZebra found an unfinished check after restarting. Review the files again before choosing Finish.",
}

var integrationSessionOutcomeStates = []string{
	"scheduled", "preparing", "needs-decisions", "ready", "blocked",
	"obsolete", "failed", "cancelled", "recovered",
}

// gitJargonPattern matches the vocabulary users of ControlZebra do not know.
// Word boundaries matter: "refreshed" must not trip the "ref" rule.
var gitJargonPattern = regexp.MustCompile(`(?i)\b(commit|commits|committed|branch|branches|merge|merged|merging|rebase|stash|head|sha|staging|staged|index|checkout|push|pushed|pull|repo|repository|worktree|ref|refs|upstream|origin|remote|revision|oid|detached)\b`)

func TestIntegrationSessionOutcomeMessagesCoverEveryState(t *testing.T) {
	if len(integrationSessionOutcomeMessages) != len(integrationSessionOutcomeStates) {
		t.Fatalf("expected %d messages, got %d", len(integrationSessionOutcomeStates), len(integrationSessionOutcomeMessages))
	}
	for _, state := range integrationSessionOutcomeStates {
		if strings.TrimSpace(integrationSessionOutcomeMessages[state]) == "" {
			t.Fatalf("no message for state %q", state)
		}
	}
}

func TestIntegrationSessionOutcomeMessagesAvoidGitJargon(t *testing.T) {
	for state, message := range integrationSessionOutcomeMessages {
		if found := gitJargonPattern.FindString(message); found != "" {
			t.Errorf("state %q exposes git jargon %q: %s", state, found, message)
		}
	}
}

func TestIntegrationSessionOutcomeMessagesStateWhatHappenedThenNextStep(t *testing.T) {
	for state, message := range integrationSessionOutcomeMessages {
		sentences := 0
		for _, part := range strings.Split(message, ".") {
			if strings.TrimSpace(part) != "" {
				sentences++
			}
		}
		if sentences < 2 {
			t.Errorf("state %q needs what happened plus a next step: %s", state, message)
		}
		if !strings.HasSuffix(message, ".") {
			t.Errorf("state %q message is not a complete sentence: %s", state, message)
		}
	}
}
