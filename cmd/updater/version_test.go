package main

import (
	"testing"
)

func TestParseSemver(t *testing.T) {
	tests := []struct {
		input   string
		want    semver
		wantErr bool
	}{
		{"0.0.0", semver{0, 0, 0, ""}, false},
		{"0.3.0", semver{0, 3, 0, ""}, false},
		{"1.2.3", semver{1, 2, 3, ""}, false},
		{"v1.2.3", semver{1, 2, 3, ""}, false},
		{"0.3.0-beta.1", semver{0, 3, 0, "beta.1"}, false},
		{"v2.0.0-rc.1", semver{2, 0, 0, "rc.1"}, false},
		{"10.20.30", semver{10, 20, 30, ""}, false},

		// Invalid
		{"", semver{}, true},
		{"v", semver{}, true},
		{"1.2", semver{}, true},
		{"1.2.3.4", semver{}, true},
		{"a.b.c", semver{}, true},
		{"1.2.three", semver{}, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parseSemver(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseSemver(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("parseSemver(%q) = %+v, want %+v", tt.input, got, tt.want)
			}
		})
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		// Equal
		{"0.0.0", "0.0.0", 0},
		{"1.2.3", "1.2.3", 0},
		{"v1.2.3", "1.2.3", 0},

		// Major differences
		{"2.0.0", "1.0.0", 1},
		{"1.0.0", "2.0.0", -1},

		// Minor differences
		{"1.3.0", "1.2.0", 1},
		{"1.2.0", "1.3.0", -1},

		// Patch differences
		{"1.2.4", "1.2.3", 1},
		{"1.2.3", "1.2.4", -1},

		// Pre-release vs release: release wins
		{"0.3.0", "0.3.0-beta.1", 1},
		{"0.3.0-beta.1", "0.3.0", -1},

		// Both pre-release: lexicographic
		{"0.3.0-alpha", "0.3.0-beta", -1},
		{"0.3.0-beta.2", "0.3.0-beta.1", 1},
		{"0.3.0-rc.1", "0.3.0-beta.1", 1},

		// Real-world upgrade scenarios
		{"0.2.0", "0.3.0", -1},   // v0.2.0 → v0.3.0 is an upgrade
		{"0.0.0-dev", "0.3.0", -1}, // dev → release is an upgrade
		{"0.3.0", "0.3.1", -1},   // patch bump
		{"0.3.0", "1.0.0", -1},   // major bump
	}

	for _, tt := range tests {
		t.Run(tt.a+"_vs_"+tt.b, func(t *testing.T) {
			got, err := CompareVersions(tt.a, tt.b)
			if err != nil {
				t.Fatalf("CompareVersions(%q, %q) error: %v", tt.a, tt.b, err)
			}
			if got != tt.want {
				t.Errorf("CompareVersions(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCompareVersionsErrors(t *testing.T) {
	tests := []struct {
		a, b string
	}{
		{"", "1.0.0"},
		{"1.0.0", ""},
		{"garbage", "1.0.0"},
		{"1.0.0", "not.a.ver"},
	}

	for _, tt := range tests {
		t.Run(tt.a+"_vs_"+tt.b, func(t *testing.T) {
			_, err := CompareVersions(tt.a, tt.b)
			if err == nil {
				t.Errorf("CompareVersions(%q, %q) expected error, got nil", tt.a, tt.b)
			}
		})
	}
}

func TestIsNewer(t *testing.T) {
	tests := []struct {
		current   string
		candidate string
		want      bool
	}{
		{"0.2.0", "0.3.0", true},
		{"0.3.0", "0.3.0", false},
		{"0.3.0", "0.2.0", false},
		{"0.3.0-beta.1", "0.3.0", true},
		{"0.3.0", "0.3.0-beta.1", false},
		{"0.0.0-dev", "0.1.0", true},
	}

	for _, tt := range tests {
		t.Run(tt.current+"_to_"+tt.candidate, func(t *testing.T) {
			got, err := IsNewer(tt.current, tt.candidate)
			if err != nil {
				t.Fatalf("IsNewer(%q, %q) error: %v", tt.current, tt.candidate, err)
			}
			if got != tt.want {
				t.Errorf("IsNewer(%q, %q) = %v, want %v", tt.current, tt.candidate, got, tt.want)
			}
		})
	}
}
