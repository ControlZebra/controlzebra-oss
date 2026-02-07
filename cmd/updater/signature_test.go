package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// generateTestKeyPair creates an Ed25519 key pair for testing and returns
// both keys as base64 strings.
func generateTestKeyPair(t *testing.T) (publicKeyB64, privateKeyB64 string) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate key pair: %v", err)
	}
	return base64.StdEncoding.EncodeToString(pub), base64.StdEncoding.EncodeToString(priv)
}

// signTestData signs data with the private key and returns a base64 signature.
func signTestData(t *testing.T, data []byte, privateKeyB64 string) string {
	t.Helper()
	sig, err := SignManifest(data, privateKeyB64)
	if err != nil {
		t.Fatalf("failed to sign data: %v", err)
	}
	return sig
}

// ──────────────────────────────────────────────────────────────────────────────
// VerifyManifestSignature tests
// ──────────────────────────────────────────────────────────────────────────────

func TestVerifyManifestSignature_ValidSignature(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	manifest := []byte(`{"version":"1.0.0","platforms":{}}`)

	sig := signTestData(t, manifest, privB64)

	err := VerifyManifestSignature(manifest, pubB64, sig)
	if err != nil {
		t.Errorf("expected valid signature to verify, got error: %v", err)
	}
}

func TestVerifyManifestSignature_TamperedManifest(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	original := []byte(`{"version":"1.0.0","platforms":{}}`)
	tampered := []byte(`{"version":"1.0.0","platforms":{},"malicious":true}`)

	sig := signTestData(t, original, privB64)

	err := VerifyManifestSignature(tampered, pubB64, sig)
	if err == nil {
		t.Error("expected tampered manifest to fail verification, got nil")
	}
}

func TestVerifyManifestSignature_WrongPublicKey(t *testing.T) {
	_, privB64 := generateTestKeyPair(t)     // Signer's key pair
	wrongPubB64, _ := generateTestKeyPair(t) // Different key pair
	manifest := []byte(`{"version":"1.0.0","platforms":{}}`)

	sig := signTestData(t, manifest, privB64)

	err := VerifyManifestSignature(manifest, wrongPubB64, sig)
	if err == nil {
		t.Error("expected wrong public key to fail verification, got nil")
	}
}

func TestVerifyManifestSignature_BadPublicKeyEncoding(t *testing.T) {
	manifest := []byte(`{"version":"1.0.0"}`)
	err := VerifyManifestSignature(manifest, "not-valid-base64!!!", "AAAA")
	if err == nil {
		t.Error("expected bad public key encoding to return error")
	}
}

func TestVerifyManifestSignature_WrongPublicKeySize(t *testing.T) {
	manifest := []byte(`{"version":"1.0.0"}`)
	// 16 bytes instead of 32
	shortKey := base64.StdEncoding.EncodeToString(make([]byte, 16))
	sig := base64.StdEncoding.EncodeToString(make([]byte, 64))

	err := VerifyManifestSignature(manifest, shortKey, sig)
	if err == nil {
		t.Error("expected wrong key size to return error")
	}
}

func TestVerifyManifestSignature_BadSignatureEncoding(t *testing.T) {
	pubB64, _ := generateTestKeyPair(t)
	manifest := []byte(`{"version":"1.0.0"}`)

	err := VerifyManifestSignature(manifest, pubB64, "not-valid-base64!!!")
	if err == nil {
		t.Error("expected bad signature encoding to return error")
	}
}

func TestVerifyManifestSignature_WrongSignatureSize(t *testing.T) {
	pubB64, _ := generateTestKeyPair(t)
	manifest := []byte(`{"version":"1.0.0"}`)
	// 32 bytes instead of 64
	shortSig := base64.StdEncoding.EncodeToString(make([]byte, 32))

	err := VerifyManifestSignature(manifest, pubB64, shortSig)
	if err == nil {
		t.Error("expected wrong signature size to return error")
	}
}

func TestVerifyManifestSignature_EmptyManifest(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	manifest := []byte("")

	sig := signTestData(t, manifest, privB64)

	// Even an empty manifest should have a valid signature
	err := VerifyManifestSignature(manifest, pubB64, sig)
	if err != nil {
		t.Errorf("expected valid signature on empty data, got: %v", err)
	}
}

func TestVerifyManifestSignature_LargeManifest(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	// Simulate a manifest with many platforms and long release notes
	manifest := make([]byte, 100_000)
	for i := range manifest {
		manifest[i] = byte('A' + (i % 26))
	}

	sig := signTestData(t, manifest, privB64)

	err := VerifyManifestSignature(manifest, pubB64, sig)
	if err != nil {
		t.Errorf("expected valid signature on large data, got: %v", err)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// SignManifest tests
// ──────────────────────────────────────────────────────────────────────────────

func TestSignManifest_RoundTrip(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	manifest := []byte(`{"version":"2.0.0","releaseDate":"2026-02-07","platforms":{"darwin-arm64":{"url":"https://example.com","size":1000,"checksum":"sha256:abc"}}}`)

	sig, err := SignManifest(manifest, privB64)
	if err != nil {
		t.Fatalf("SignManifest failed: %v", err)
	}

	// Verify the signature
	err = VerifyManifestSignature(manifest, pubB64, sig)
	if err != nil {
		t.Errorf("round-trip verification failed: %v", err)
	}
}

func TestSignManifest_BadPrivateKeyEncoding(t *testing.T) {
	_, err := SignManifest([]byte("test"), "not-valid-base64!!!")
	if err == nil {
		t.Error("expected bad private key encoding to return error")
	}
}

func TestSignManifest_WrongPrivateKeySize(t *testing.T) {
	shortKey := base64.StdEncoding.EncodeToString(make([]byte, 32))
	_, err := SignManifest([]byte("test"), shortKey)
	if err == nil {
		t.Error("expected wrong private key size to return error")
	}
}

func TestSignManifest_DeterministicSignatures(t *testing.T) {
	_, privB64 := generateTestKeyPair(t)
	manifest := []byte(`{"version":"1.0.0"}`)

	sig1, _ := SignManifest(manifest, privB64)
	sig2, _ := SignManifest(manifest, privB64)

	// Ed25519 signatures are deterministic — same key + same data = same signature
	if sig1 != sig2 {
		t.Error("expected deterministic signatures for same input")
	}
}

func TestSignManifest_DifferentDataDifferentSignatures(t *testing.T) {
	_, privB64 := generateTestKeyPair(t)
	data1 := []byte(`{"version":"1.0.0"}`)
	data2 := []byte(`{"version":"2.0.0"}`)

	sig1, _ := SignManifest(data1, privB64)
	sig2, _ := SignManifest(data2, privB64)

	if sig1 == sig2 {
		t.Error("expected different data to produce different signatures")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// FetchSignature tests (using httptest)
// ──────────────────────────────────────────────────────────────────────────────

func TestFetchSignature_Success(t *testing.T) {
	expectedSig := "dGVzdC1zaWduYXR1cmUtYmFzZTY0" // base64 of "test-signature-base64"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/update.json.sig" {
			fmt.Fprint(w, expectedSig)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	sig, err := FetchSignature(server.URL, 5*1000_000_000) // 5s
	if err != nil {
		t.Fatalf("FetchSignature failed: %v", err)
	}
	if sig != expectedSig {
		t.Errorf("expected signature %q, got %q", expectedSig, sig)
	}
}

func TestFetchSignature_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer server.Close()

	_, err := FetchSignature(server.URL, 5*1000_000_000)
	if err == nil {
		t.Error("expected error for missing signature file")
	}
}

func TestFetchSignature_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	_, err := FetchSignature(server.URL, 5*1000_000_000)
	if err == nil {
		t.Error("expected error for server error response")
	}
}

func TestFetchSignature_EmptyBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 200 OK but empty body
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	_, err := FetchSignature(server.URL, 5*1000_000_000)
	if err == nil {
		t.Error("expected error for empty signature body")
	}
}

func TestFetchSignature_TrimsWhitespace(t *testing.T) {
	expectedSig := "dGVzdA=="

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/update.json.sig" {
			fmt.Fprintf(w, "  %s  \n", expectedSig)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	sig, err := FetchSignature(server.URL, 5*1000_000_000)
	if err != nil {
		t.Fatalf("FetchSignature failed: %v", err)
	}
	if sig != expectedSig {
		t.Errorf("expected trimmed signature %q, got %q", expectedSig, sig)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// End-to-end: sign → serve → fetch → verify
// ──────────────────────────────────────────────────────────────────────────────

func TestEndToEnd_SignAndVerifyViaHTTP(t *testing.T) {
	pubB64, privB64 := generateTestKeyPair(t)
	manifest := []byte(`{"version":"1.0.0","releaseDate":"2026-02-07","platforms":{"darwin-arm64":{"url":"https://example.com/binary","size":15000000,"checksum":"sha256:abcdef1234567890"}}}`)

	// Sign the manifest
	sigB64, err := SignManifest(manifest, privB64)
	if err != nil {
		t.Fatalf("SignManifest failed: %v", err)
	}

	// Serve both manifest and signature via httptest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/update.json":
			w.Header().Set("Content-Type", "application/json")
			w.Write(manifest)
		case "/update.json.sig":
			w.Header().Set("Content-Type", "text/plain")
			fmt.Fprint(w, sigB64)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	// Fetch the manifest raw bytes
	rawBytes, err := FetchManifestRaw(server.URL, 5*1000_000_000)
	if err != nil {
		t.Fatalf("FetchManifestRaw failed: %v", err)
	}

	// Fetch the signature
	fetchedSig, err := FetchSignature(server.URL, 5*1000_000_000)
	if err != nil {
		t.Fatalf("FetchSignature failed: %v", err)
	}

	// Verify
	err = VerifyManifestSignature(rawBytes, pubB64, fetchedSig)
	if err != nil {
		t.Errorf("end-to-end verification failed: %v", err)
	}

	// Also parse the manifest to make sure it's valid
	parsed, err := ParseManifest(rawBytes)
	if err != nil {
		t.Fatalf("ParseManifest failed: %v", err)
	}
	if parsed.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", parsed.Version)
	}
}
