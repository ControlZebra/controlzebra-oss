package services

import (
	"path/filepath"
	"testing"
)

func TestResolveDataLocationsFor_WindowsPolicyPaths(t *testing.T) {
	getenv := func(name string) string {
		switch name {
		case "APPDATA":
			return `C:\Users\tester\AppData\Roaming`
		case "LOCALAPPDATA":
			return `C:\Users\tester\AppData\Local`
		default:
			return ""
		}
	}

	locations := resolveDataLocationsFor("windows", getenv)

	expectedRoaming := filepath.Join(`C:\Users\tester\AppData\Roaming`, canonicalAppDirName, configSubDirName)
	if locations.RoamingConfigDir != expectedRoaming {
		t.Fatalf("expected roaming dir %q, got %q", expectedRoaming, locations.RoamingConfigDir)
	}

	expectedLocal := filepath.Join(`C:\Users\tester\AppData\Local`, canonicalAppDirName)
	if locations.LocalDataDir != expectedLocal {
		t.Fatalf("expected local data dir %q, got %q", expectedLocal, locations.LocalDataDir)
	}

	expectedTools := filepath.Join(expectedLocal, toolsSubDirName, binSubDirName)
	if locations.ToolsBinDir != expectedTools {
		t.Fatalf("expected tools bin dir %q, got %q", expectedTools, locations.ToolsBinDir)
	}

	expectedLegacy := filepath.Join(`C:\Users\tester\AppData\Roaming`, legacyAppDirName)
	if locations.LegacyRoamingConfigDir != expectedLegacy {
		t.Fatalf("expected legacy roaming dir %q, got %q", expectedLegacy, locations.LegacyRoamingConfigDir)
	}
}

func TestResolveDataLocationsFor_UsesCanonicalName(t *testing.T) {
	getenv := func(name string) string {
		switch name {
		case "APPDATA":
			return `/tmp/roaming`
		case "LOCALAPPDATA":
			return `/tmp/local`
		default:
			return ""
		}
	}

	locations := resolveDataLocationsFor("windows", getenv)

	if filepath.Base(filepath.Dir(locations.RoamingConfigDir)) != canonicalAppDirName {
		t.Fatalf("expected canonical folder name %q in roaming path %q", canonicalAppDirName, locations.RoamingConfigDir)
	}
	if filepath.Base(locations.LocalDataDir) != canonicalAppDirName {
		t.Fatalf("expected canonical folder name %q in local path %q", canonicalAppDirName, locations.LocalDataDir)
	}
}
