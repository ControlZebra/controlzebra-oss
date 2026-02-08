// Package services provides backend functionality for the ControlZebra application.
// This file contains the AuthService which stores and retrieves Supabase session
// tokens securely via the OS credential store (macOS Keychain, Windows Credential
// Manager, Linux Secret Service / libsecret).
package services

import (
	"fmt"
	"sync"

	"github.com/zalando/go-keyring"
)

const (
	// keyringService is the service name stored in the OS credential manager.
	// Changing this will invalidate any previously stored sessions.
	keyringService = "com.controlzebra.desktop"

	// keyringUser is the account name under which the session token is stored.
	keyringUser = "supabase-session"
)

// AuthService provides secure session persistence via the OS keychain.
// The frontend calls SaveSession after successful login, LoadSession on app
// startup to rehydrate, and ClearSession on logout.
type AuthService struct {
	mu sync.Mutex
}

// NewAuthService creates a new AuthService instance.
func NewAuthService() *AuthService {
	return &AuthService{}
}

// SaveSession stores the serialised Supabase session JSON in the OS keychain.
// It overwrites any previously stored session.
func (a *AuthService) SaveSession(sessionJSON string) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if sessionJSON == "" {
		return fmt.Errorf("session data cannot be empty")
	}

	// go-keyring's Set creates or updates the credential
	if err := keyring.Set(keyringService, keyringUser, sessionJSON); err != nil {
		return fmt.Errorf("failed to save session to keychain: %w", err)
	}

	return nil
}

// LoadSession retrieves the stored Supabase session JSON from the OS keychain.
// Returns an empty string (no error) if no session has been stored yet, so the
// frontend can treat empty-string as "not authenticated".
func (a *AuthService) LoadSession() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	secret, err := keyring.Get(keyringService, keyringUser)
	if err != nil {
		// "not found" is the expected case when no session has been stored.
		// go-keyring returns keyring.ErrNotFound for this.
		if err == keyring.ErrNotFound {
			return "", nil
		}
		return "", fmt.Errorf("failed to load session from keychain: %w", err)
	}

	return secret, nil
}

// ClearSession removes the stored session from the OS keychain.
// It is a no-op (no error) if no session exists.
func (a *AuthService) ClearSession() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	err := keyring.Delete(keyringService, keyringUser)
	if err != nil && err != keyring.ErrNotFound {
		return fmt.Errorf("failed to clear session from keychain: %w", err)
	}

	return nil
}
