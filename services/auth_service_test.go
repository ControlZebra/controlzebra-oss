package services

import (
	"encoding/json"
	"testing"
)

// TestAuthServiceRoundTrip verifies save → load → clear lifecycle.
// NOTE: This test interacts with the real OS keychain. On CI you may need to
// set the KEYRING_MOCK_KEYRING=true env var or use the go-keyring mock backend.
func TestAuthServiceRoundTrip(t *testing.T) {
	svc := NewAuthService()

	// Clean slate
	_ = svc.ClearSession()

	// 1. LoadSession should return empty when nothing is stored
	session, err := svc.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession on empty keychain: %v", err)
	}
	if session != "" {
		t.Fatalf("expected empty session, got: %s", session)
	}

	// 2. SaveSession should persist data
	testSession := map[string]interface{}{
		"access_token":  "test-access-token",
		"refresh_token": "test-refresh-token",
		"expires_at":    1700000000,
	}
	data, _ := json.Marshal(testSession)
	if err := svc.SaveSession(string(data)); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	// 3. LoadSession should return what we saved
	loaded, err := svc.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession after save: %v", err)
	}
	if loaded != string(data) {
		t.Fatalf("loaded session mismatch.\nwant: %s\ngot:  %s", string(data), loaded)
	}

	// 4. ClearSession should remove it
	if err := svc.ClearSession(); err != nil {
		t.Fatalf("ClearSession: %v", err)
	}

	session, err = svc.LoadSession()
	if err != nil {
		t.Fatalf("LoadSession after clear: %v", err)
	}
	if session != "" {
		t.Fatalf("expected empty session after clear, got: %s", session)
	}
}

// TestAuthServiceSaveEmptyRejects verifies that empty session data is rejected.
func TestAuthServiceSaveEmptyRejects(t *testing.T) {
	svc := NewAuthService()

	err := svc.SaveSession("")
	if err == nil {
		t.Fatal("expected error when saving empty session, got nil")
	}
}
