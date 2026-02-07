package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// VerifyManifestSignature verifies the Ed25519 signature of manifest bytes.
//
// This is the core security check — it proves the manifest was signed by the
// holder of the private key and has not been tampered with in transit. Without
// this, a MITM attacker could serve a malicious manifest pointing to a
// backdoored binary (the checksum in the manifest would match the bad binary).
//
// Parameters:
//   - manifestBytes: the raw bytes of update.json exactly as downloaded
//   - publicKeyB64:  base64-encoded Ed25519 public key (32 bytes decoded)
//   - signatureB64:  base64-encoded Ed25519 signature (64 bytes decoded)
//
// Returns nil if the signature is valid, or an error describing the failure.
func VerifyManifestSignature(manifestBytes []byte, publicKeyB64, signatureB64 string) error {
	// Decode the public key
	pubKeyBytes, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil {
		return fmt.Errorf("invalid public key encoding: %w", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: expected %d bytes, got %d", ed25519.PublicKeySize, len(pubKeyBytes))
	}

	// Decode the signature
	sigBytes, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return fmt.Errorf("invalid signature encoding: %w", err)
	}
	if len(sigBytes) != ed25519.SignatureSize {
		return fmt.Errorf("invalid signature size: expected %d bytes, got %d", ed25519.SignatureSize, len(sigBytes))
	}

	// Verify
	pubKey := ed25519.PublicKey(pubKeyBytes)
	if !ed25519.Verify(pubKey, manifestBytes, sigBytes) {
		return fmt.Errorf("signature verification failed — manifest may have been tampered with")
	}

	return nil
}

// FetchSignature downloads the signature file from <baseURL>/update.json.sig.
// The signature file contains the base64-encoded Ed25519 signature of update.json.
//
// Returns the base64-encoded signature string (whitespace-trimmed).
func FetchSignature(baseURL string, timeout time.Duration) (string, error) {
	baseURL = strings.TrimRight(baseURL, "/")
	sigURL := baseURL + "/update.json.sig"

	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(sigURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch signature: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", fmt.Errorf("signature file not found at %s (HTTP 404)", sigURL)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("signature fetch returned HTTP %d", resp.StatusCode)
	}

	// Ed25519 signatures are 64 bytes → ~88 chars base64. Limit to 1 KB for safety.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return "", fmt.Errorf("failed to read signature: %w", err)
	}

	sig := strings.TrimSpace(string(body))
	if sig == "" {
		return "", fmt.Errorf("signature file is empty")
	}

	return sig, nil
}

// SignManifest signs manifest bytes with an Ed25519 private key.
// This is used by the signing tool (scripts/signing/main.go) — not by the
// sidecar itself. Included here so the test can exercise the full round-trip.
//
// Parameters:
//   - manifestBytes:  the raw bytes to sign
//   - privateKeyB64:  base64-encoded Ed25519 private key (64 bytes decoded)
//
// Returns the base64-encoded signature.
func SignManifest(manifestBytes []byte, privateKeyB64 string) (string, error) {
	privKeyBytes, err := base64.StdEncoding.DecodeString(privateKeyB64)
	if err != nil {
		return "", fmt.Errorf("invalid private key encoding: %w", err)
	}
	if len(privKeyBytes) != ed25519.PrivateKeySize {
		return "", fmt.Errorf("invalid private key size: expected %d bytes, got %d", ed25519.PrivateKeySize, len(privKeyBytes))
	}

	privKey := ed25519.PrivateKey(privKeyBytes)
	sig := ed25519.Sign(privKey, manifestBytes)

	return base64.StdEncoding.EncodeToString(sig), nil
}
