package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"strings"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "keygen":
		runKeygen()
	case "sign":
		runSign(os.Args[2:])
	case "verify":
		runVerify(os.Args[2:])
	case "help", "--help", "-h":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, "ControlZebra Update Signing Tool\n\n")
	fmt.Fprintf(os.Stderr, "Usage:\n")
	fmt.Fprintf(os.Stderr, "  go run ./scripts/signing/ <command> [flags]\n\n")
	fmt.Fprintf(os.Stderr, "Commands:\n")
	fmt.Fprintf(os.Stderr, "  keygen    Generate a new Ed25519 key pair for update signing\n")
	fmt.Fprintf(os.Stderr, "  sign      Sign a file (update.json) with the private key\n")
	fmt.Fprintf(os.Stderr, "  verify    Verify a file's signature with the public key\n\n")
	fmt.Fprintf(os.Stderr, "Examples:\n\n")
	fmt.Fprintf(os.Stderr, "  # One-time: generate a key pair\n")
	fmt.Fprintf(os.Stderr, "  go run ./scripts/signing/ keygen\n\n")
	fmt.Fprintf(os.Stderr, "  # During release: sign the manifest\n")
	fmt.Fprintf(os.Stderr, "  go run ./scripts/signing/ sign --key \"$CZ_SIGNING_KEY\" --file release/0.1.0/update.json\n\n")
	fmt.Fprintf(os.Stderr, "  # Verify before publishing\n")
	fmt.Fprintf(os.Stderr, "  go run ./scripts/signing/ verify --key \"$SIGNING_PUBLIC_KEY\" --file release/0.1.0/update.json --sig release/0.1.0/update.json.sig\n\n")
}

func runKeygen() {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error generating key pair: %v\n", err)
		os.Exit(1)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pub)
	privB64 := base64.StdEncoding.EncodeToString(priv)

	fmt.Println("Ed25519 Key Pair - ControlZebra Update Signing")
	fmt.Println("===============================================")
	fmt.Println()
	fmt.Printf("  Public key (base64):  %s\n", pubB64)
	fmt.Println()
	fmt.Printf("  Private key (base64): %s\n", privB64)
	fmt.Println()
	fmt.Println("IMPORTANT - store these keys securely:")
	fmt.Println()
	fmt.Println("  PUBLIC KEY:")
	fmt.Println("    Add to Taskfile.yml as SIGNING_PUBLIC_KEY variable")
	fmt.Println("    This gets compiled into the cz-updater binary")
	fmt.Println("    Safe to commit to the repository")
	fmt.Println()
	fmt.Println("  PRIVATE KEY:")
	fmt.Println("    Store in GitHub Actions secrets: UPDATE_SIGNING_KEY")
	fmt.Println("    Or export as environment variable for local signing")
	fmt.Println("    NEVER commit to the repository")
}

func runSign(args []string) {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	keyStr := fs.String("key", "", "Base64-encoded Ed25519 private key (or env: CZ_SIGNING_KEY)")
	filePath := fs.String("file", "", "Path to the file to sign (required)")
	outputPath := fs.String("output", "", "Output path for signature (default: <file>.sig)")
	fs.Parse(args)

	if *keyStr == "" {
		*keyStr = os.Getenv("CZ_SIGNING_KEY")
	}
	if *keyStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --key is required (or set CZ_SIGNING_KEY env var)")
		fmt.Fprintln(os.Stderr)
		fs.Usage()
		os.Exit(1)
	}
	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "Error: --file is required")
		fmt.Fprintln(os.Stderr)
		fs.Usage()
		os.Exit(1)
	}

	privKeyBytes, err := base64.StdEncoding.DecodeString(*keyStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: invalid private key encoding: %v\n", err)
		os.Exit(1)
	}
	if len(privKeyBytes) != ed25519.PrivateKeySize {
		fmt.Fprintf(os.Stderr, "Error: invalid private key size: expected %d bytes, got %d\n", ed25519.PrivateKeySize, len(privKeyBytes))
		os.Exit(1)
	}

	data, err := os.ReadFile(*filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to read file: %v\n", err)
		os.Exit(1)
	}

	privKey := ed25519.PrivateKey(privKeyBytes)
	sig := ed25519.Sign(privKey, data)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	outPath := *outputPath
	if outPath == "" {
		outPath = *filePath + ".sig"
	}

	if err := os.WriteFile(outPath, []byte(sigB64+"\n"), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to write signature: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Signed %s\n", *filePath)
	fmt.Printf("  Signature: %s\n", outPath)
	fmt.Printf("  Base64:    %.40s...\n", sigB64)
}

func runVerify(args []string) {
	fs := flag.NewFlagSet("verify", flag.ExitOnError)
	keyStr := fs.String("key", "", "Base64-encoded Ed25519 public key (or env: SIGNING_PUBLIC_KEY)")
	filePath := fs.String("file", "", "Path to the file to verify (required)")
	sigInput := fs.String("sig", "", "Path to .sig file, or raw base64 signature string (required)")
	fs.Parse(args)

	if *keyStr == "" {
		*keyStr = os.Getenv("SIGNING_PUBLIC_KEY")
	}
	if *keyStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --key is required (or set SIGNING_PUBLIC_KEY env var)")
		fmt.Fprintln(os.Stderr)
		fs.Usage()
		os.Exit(1)
	}
	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "Error: --file is required")
		os.Exit(1)
	}
	if *sigInput == "" {
		fmt.Fprintln(os.Stderr, "Error: --sig is required")
		os.Exit(1)
	}

	pubKeyBytes, err := base64.StdEncoding.DecodeString(*keyStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: invalid public key encoding: %v\n", err)
		os.Exit(1)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		fmt.Fprintf(os.Stderr, "Error: invalid public key size: expected %d bytes, got %d\n", ed25519.PublicKeySize, len(pubKeyBytes))
		os.Exit(1)
	}

	data, err := os.ReadFile(*filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to read file: %v\n", err)
		os.Exit(1)
	}

	var sigB64 string
	if fileBytes, readErr := os.ReadFile(*sigInput); readErr == nil {
		sigB64 = strings.TrimSpace(string(fileBytes))
	} else {
		sigB64 = strings.TrimSpace(*sigInput)
	}

	sigBytes, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: invalid signature encoding: %v\n", err)
		os.Exit(1)
	}
	if len(sigBytes) != ed25519.SignatureSize {
		fmt.Fprintf(os.Stderr, "Error: invalid signature size: expected %d bytes, got %d\n", ed25519.SignatureSize, len(sigBytes))
		os.Exit(1)
	}

	pubKey := ed25519.PublicKey(pubKeyBytes)
	if ed25519.Verify(pubKey, data, sigBytes) {
		fmt.Printf("Signature valid for %s\n", *filePath)
	} else {
		fmt.Fprintf(os.Stderr, "Signature verification FAILED for %s\n", *filePath)
		fmt.Fprintln(os.Stderr, "  The manifest may have been tampered with, or the wrong key was used.")
		os.Exit(1)
	}
}
