package main

import (
	"fmt"
	"strconv"
	"strings"
)

// semver represents a parsed semantic version (major.minor.patch) with an
// optional pre-release suffix. We keep this minimal — no build metadata support
// — because ControlZebra versions are always simple X.Y.Z or X.Y.Z-tag strings.
type semver struct {
	Major      int
	Minor      int
	Patch      int
	PreRelease string // empty string means a release version
}

// parseSemver parses a version string like "0.1.0", "v1.2.3", or "0.1.0-beta.1".
// Leading "v" is stripped. Returns an error if the string isn't valid semver.
func parseSemver(s string) (semver, error) {
	s = strings.TrimPrefix(s, "v")
	if s == "" {
		return semver{}, fmt.Errorf("empty version string")
	}

	// Split off pre-release tag at first hyphen
	var pre string
	if idx := strings.IndexByte(s, '-'); idx != -1 {
		pre = s[idx+1:]
		s = s[:idx]
	}

	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return semver{}, fmt.Errorf("expected 3 version components in %q, got %d", s, len(parts))
	}

	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return semver{}, fmt.Errorf("invalid major version %q: %w", parts[0], err)
	}
	minor, err := strconv.Atoi(parts[1])
	if err != nil {
		return semver{}, fmt.Errorf("invalid minor version %q: %w", parts[1], err)
	}
	patch, err := strconv.Atoi(parts[2])
	if err != nil {
		return semver{}, fmt.Errorf("invalid patch version %q: %w", parts[2], err)
	}

	return semver{
		Major:      major,
		Minor:      minor,
		Patch:      patch,
		PreRelease: pre,
	}, nil
}

// CompareVersions compares two semantic version strings.
// Returns:
//
//	-1 if a < b
//	 0 if a == b
//	+1 if a > b
//
// Pre-release versions (e.g. "0.1.0-beta.1") sort BEFORE their release
// counterpart ("0.1.0"), following the semver spec. If both have pre-release
// tags, they are compared lexicographically.
func CompareVersions(a, b string) (int, error) {
	va, err := parseSemver(a)
	if err != nil {
		return 0, fmt.Errorf("invalid version %q: %w", a, err)
	}
	vb, err := parseSemver(b)
	if err != nil {
		return 0, fmt.Errorf("invalid version %q: %w", b, err)
	}

	// Compare major.minor.patch numerically
	if va.Major != vb.Major {
		return cmpInt(va.Major, vb.Major), nil
	}
	if va.Minor != vb.Minor {
		return cmpInt(va.Minor, vb.Minor), nil
	}
	if va.Patch != vb.Patch {
		return cmpInt(va.Patch, vb.Patch), nil
	}

	// Same major.minor.patch — compare pre-release tags.
	// Per semver: a version with pre-release has lower precedence than the release.
	// "0.1.0-beta.1" < "0.1.0"
	if va.PreRelease == "" && vb.PreRelease == "" {
		return 0, nil
	}
	if va.PreRelease == "" && vb.PreRelease != "" {
		return 1, nil // a is release, b is pre-release → a > b
	}
	if va.PreRelease != "" && vb.PreRelease == "" {
		return -1, nil // a is pre-release, b is release → a < b
	}

	// Both have pre-release tags — lexicographic comparison
	return cmpString(va.PreRelease, vb.PreRelease), nil
}

// IsNewer returns true if candidate is a newer version than current.
func IsNewer(current, candidate string) (bool, error) {
	cmp, err := CompareVersions(candidate, current)
	if err != nil {
		return false, err
	}
	return cmp > 0, nil
}

func cmpInt(a, b int) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func cmpString(a, b string) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}
