# Windows ARM64 + amd64 Distribution + Code Signing Plan

Owner: Engineering (Release)
Status: Proposed
Target window: 2–3 weeks to first signed GA installer

---

## 1) Objective

Ship trusted, signed Windows ARM64 and amd64 builds of ControlZebra that install cleanly on both device classes, pass SmartScreen more reliably, and support auto-update integrity.

This plan covers:
- `.exe` + installer distribution for Windows ARM64 and amd64
- certificate purchase/provisioning
- signing flow from macOS (primary) and Windows (fallback/recommended for EV)

---

## 2) Scope and Deliverables

### In scope
- Build artifact for `windows-arm64`
- Build artifact for `windows-amd64`
- Signed main binaries (`control-zebra-windows-arm64.exe`, `control-zebra-windows-amd64.exe`)
- Signed installers (`control-zebra-arm64-installer.exe`, `control-zebra-amd64-installer.exe`)
- Timestamped Authenticode signatures
- Verification steps in CI and release checklist

### Out of scope
- Microsoft Store onboarding (optional future)
- Enterprise WDAC policy documentation

---

## 3) Distribution Strategy for Windows ARM64 + amd64

## 3.1 Artifacts to publish

1. ARM64 installer (primary): NSIS output from existing pipeline
2. amd64 installer (primary): NSIS output from existing pipeline
3. ARM64 portable `.exe` (secondary, advanced users)
4. amd64 portable `.exe` (secondary, advanced users)
5. Checksums (`SHA256SUMS.txt`)
6. Release notes with explicit ARM64 + amd64 support statement

## 3.2 Release channels

- Beta channel: current release feed (`controlzebra-releases/desktop/beta`)
- Stable channel: add when SmartScreen reputation and support confidence are acceptable

## 3.3 Build and package path

Use existing build path and keep one canonical command family:
- build binaries via Task (`windows:build ARCH=arm64` and `windows:build ARCH=amd64`)
- package NSIS installers via Task (`windows:package ARCH=arm64` and `windows:package ARCH=amd64`)
- orchestrate via `scripts/build-all.sh --platforms windows-arm64,windows-amd64`

## 3.4 Runtime prerequisites

- NSIS already bootstraps WebView2; keep this in installer QA
- Continue bundling `git` and `gh` for out-of-box experience
- Verify ARM64 and amd64 bundle paths during packaging and smoke tests

---

## 4) Certificate and Signing Plan

## 4.1 Certificate decision

Pick one of these two tracks:

### Track A (fastest): OV Code Signing Certificate (PFX)
- Faster issuance and simpler automation
- Can sign from macOS or Windows
- Lower SmartScreen trust initially vs EV

### Track B (best trust): EV Code Signing Certificate
- Better SmartScreen reputation characteristics
- Usually hardware token or HSM-backed flow
- Often easier/required to sign on Windows with vendor tooling

Recommended approach:
1. Start with OV for immediate releases
2. Move to EV once release cadence stabilizes

## 4.2 Vendor shortlist

- DigiCert
- Sectigo
- GlobalSign

Selection criteria:
- EV delivery model (USB token vs cloud/HSM)
- timestamp SLA and endpoint reliability
- renewal + revocation support
- CI compatibility

## 4.3 Identity and legal prerequisites

Before purchase:
- legal entity details finalized
- D-U-N-S / business verification docs ready
- ops mailbox for certificate lifecycle alerts

---

## 5) Signing on macOS (Primary Path)

Use existing Wails/Task integration as baseline:
- `task windows:sign ARCH=arm64`
- `task windows:sign ARCH=amd64`
- `task windows:sign:installer ARCH=arm64`
- `task windows:sign:installer ARCH=amd64`

Implementation checklist:
1. Store PFX in secure secret storage (not repo)
2. Configure signing variables in [build/windows/Taskfile.yml](../../build/windows/Taskfile.yml)
3. Configure timestamp server (prefer RFC3161 endpoint)
4. Run signing tasks after packaging
5. Verify signatures and timestamp presence before publish

Notes:
- This path is strongest for OV PFX certificates.
- For EV hardware token constraints, macOS automation may be limited by vendor tooling.

---

## 6) Signing on Windows (Fallback / EV-Preferred)

If EV token/HSM or policy requires Windows:

1. Set up dedicated release VM (Windows 11, locked down)
2. Install certificate vendor middleware/token drivers
3. Sign with `signtool.exe` using SHA-256 digest + SHA-256 timestamp
4. Verify with `signtool verify /pa /v`
5. Upload only signed artifacts to release storage

When to choose this path:
- EV token only supported on Windows
- compliance requires Windows-native Authenticode tooling
- CI secrets policy disallows exportable private keys

---

## 7) CI/CD Integration Plan

## 7.1 Pipeline gates

Gate 1: Build ARM64 + amd64 binaries and installers
Gate 2: Sign binaries and installers
Gate 3: Verify signatures + timestamps
Gate 4: Publish release assets + checksums + manifest

## 7.2 Secrets and key management

- Keep cert/password in CI secret store
- Rotate credentials on renewal
- enforce least privilege on release runners
- maintain emergency revocation runbook

## 7.3 Verification automation

For each release artifact:
- signature valid
- certificate chain valid
- timestamp present and valid
- file hash matches published checksums

---

## 8) Operational Release Checklist (ARM64 + amd64)

1. `download-cli-deps.sh --platform windows-arm64`
2. `download-cli-deps.sh --platform windows-amd64`
3. Build `windows-arm64` and `windows-amd64`
4. Package ARM64 + amd64 NSIS installers
5. Sign both binaries
6. Sign both installers
7. Verify signatures/timestamps for all artifacts
8. Run ARM64 smoke test on real device (install, launch, git operations, update check)
9. Run amd64 smoke test on real device or VM (install, launch, git operations, update check)
10. Publish artifacts and checksums
11. Announce with ARM64 + amd64 support note

---

## 9) Risks and Mitigations

- SmartScreen warning on early releases
  - Mitigation: EV migration + consistent signed release cadence

- Certificate compromise
  - Mitigation: hardware-backed keys where possible, immediate revocation process

- EV tooling incompatibility on macOS
  - Mitigation: Windows signing lane maintained and documented

- Timestamp endpoint outage
  - Mitigation: primary + backup timestamp URLs in release process

---

## 10) Milestones

Week 1:
- choose CA and certificate type
- acquire OV cert and complete first signed ARM64 + amd64 beta

Week 2:
- automate verification gates in pipeline
- complete Windows fallback signing lane documentation

Week 3:
- evaluate EV migration and begin procurement if approved

---

## 11) Definition of Done

- Windows ARM64 and amd64 installers and `.exe` artifacts are signed and timestamped
- signature verification is automated in release pipeline
- release artifacts published with checksums
- documented fallback signing path exists for Windows-hosted EV workflows
- support team has a short runbook for certificate renewal/revocation
