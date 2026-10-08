package services

import (
	"context"
	"io"
	"strings"
)

const githubHost = "github.com"

// gitCredentialProfile is an execution choice, not a copy of a credential.
type gitCredentialProfile struct {
	ghPath string
	usable bool
}

// forGitOperation captures authentication once without changing the shared
// runner. Nested phases reuse the same profile; local-only callers keep r.
func (r *CommandRunner) forGitOperation(usable ...bool) *CommandRunner {
	if r.credentials != nil {
		return r
	}
	p := gitCredentialProfile{ghPath: GhPath()}
	if len(usable) > 0 {
		p.usable = usable[0]
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), r.Timeout)
		defer cancel()
		p.usable = r.runWithStderr(ctx, io.Discard, p.ghPath, "auth", "status", "--hostname", githubHost).Success
	}
	operation := *r
	operation.credentials = &p
	return &operation
}

func (p gitCredentialProfile) gitArgs(args []string) []string {
	if !p.usable {
		return args
	}
	// Git evaluates command-line configuration in order. Insert after caller
	// global options, but before the verb, so our host-specific reset wins.
	verb := 0
	for verb < len(args) && strings.HasPrefix(args[verb], "-") {
		switch args[verb] {
		case "-c", "-C", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix":
			verb++
		}
		verb++
	}
	if verb >= len(args) {
		return args
	}
	path := strings.ReplaceAll(p.ghPath, "\\", "/")
	path = "'" + strings.ReplaceAll(path, "'", "'\"'\"'") + "'"
	prepared := append([]string{}, args[:verb]...)
	prepared = append(prepared, "-c", "credential.https://github.com.helper=",
		"-c", "credential.https://github.com.helper=!"+path+" auth git-credential")
	return append(prepared, args[verb:]...)
}
