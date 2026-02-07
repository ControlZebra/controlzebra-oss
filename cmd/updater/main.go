// Package main implements the cz-updater sidecar binary.
//
// This is a small, standalone executable shipped alongside the main ControlZebra app.
// It handles update checking, downloading, and binary replacement — all without any
// Wails dependency or CGO requirement. The main app communicates with it via
// stdin/stdout JSON and spawns it as a subprocess.
//
// Subcommands:
//
//	cz-updater check    — fetch manifest, compare versions, report if update available
//	cz-updater download — download a binary with progress streaming and checksum verification
//	cz-updater apply    — wait for main app to exit, swap binaries, relaunch
//	cz-updater version  — print the sidecar version
package main

import (
	"fmt"
	"os"
)

// Version is set at build time via -ldflags "-X main.Version=x.y.z".
var Version = "0.0.0-dev"

// PublicKey is the base64-encoded Ed25519 public key for manifest signature
// verification. Compiled in at build time via:
//
//	go build -ldflags="-X main.PublicKey=<base64>" ./cmd/updater
//
// If empty, signature verification is skipped (dev/testing mode).
// If set, the sidecar will refuse to accept unsigned or tampered manifests.
var PublicKey = ""

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	var err error
	switch os.Args[1] {
	case "check":
		err = runCheck(os.Args[2:])
	case "download":
		err = runDownload(os.Args[2:])
	case "apply":
		err = runApply(os.Args[2:])
	case "version":
		fmt.Println(Version)
		if PublicKey != "" {
			fmt.Println("signature verification: enabled")
		} else {
			fmt.Println("signature verification: disabled (no public key compiled in)")
		}
		return
	case "help", "--help", "-h":
		printUsage()
		return
	default:
		fmt.Fprintf(os.Stderr, "cz-updater: unknown command %q\n\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "cz-updater %s: %v\n", os.Args[1], err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `cz-updater — ControlZebra update sidecar

Usage:
  cz-updater <command> [flags]

Commands:
  check      Check for available updates
  download   Download an update binary
  apply      Replace the running binary and relaunch
  version    Print the sidecar version

Run "cz-updater <command> --help" for details on each command.
`)
}
