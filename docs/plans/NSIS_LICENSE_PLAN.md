# NSIS Installer License Page Plan

Owner: Engineering + Product + Legal
Status: Proposed
Target: Next Windows installer release

---

## 1) Objective

Add a mandatory license/EULA step to the Windows NSIS installer so users explicitly accept terms before installation continues.

---

## 2) Current State

- The installer script already uses Modern UI pages in [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi).
- A license page hook is present but commented out (`MUI_PAGE_LICENSE`).
- There is currently no dedicated installer license text asset in the repository.

---

## 3) Decisions Needed Before Implementation

1. **License source of truth**
   - Decide whether installer text is a full EULA, OSS license, or both.
2. **Acceptance behavior**
   - Confirm whether installation should require explicit acceptance (recommended).
3. **Copy and versioning owner**
   - Legal/Product owns text updates; Engineering owns wiring and packaging.

---

## 4) Implementation Plan

### Phase A — Add canonical license asset

1. Add installer-readable text file under [build/windows/nsis/resources](../../build/windows/nsis/resources).
2. Use plain text encoding (UTF-8) and stable filename (`license.txt`).
3. Add header metadata in the file (document version + effective date).

### Phase B — Wire NSIS license page

1. Update [build/windows/nsis/project.nsi](../../build/windows/nsis/project.nsi) to enable:
   - `!insertmacro MUI_PAGE_LICENSE "resources\\license.txt"`
2. Keep page ordering as:
   - Welcome → License → Directory → Install Files → Finish.
3. If required by Legal, configure stricter acceptance UX (no silent bypass).

### Phase C — Packaging workflow hardening

1. Ensure packaging fails fast if the license file is missing.
2. Add a precondition/check in [build/windows/Taskfile.yml](../../build/windows/Taskfile.yml) before `makensis` execution.
3. Keep pathing cross-platform safe for macOS-based release builds.

### Phase D — QA and release validation

1. Build installer for AMD64 and ARM64.
2. Verify license page appears and blocks install until accepted.
3. Verify unattended cancellation exits cleanly and does not partially install.
4. Confirm signed installer output is unchanged except expected content hash/signature.

### Phase E — Documentation and release process

1. Add release checklist item: “Installer license text reviewed and current”.
2. Add maintenance note in docs for updating license text without touching NSIS logic.

---

## 5) Acceptance Criteria

- License page is displayed on every interactive NSIS install.
- User must accept terms to continue installation.
- Build fails if license asset is missing.
- Both AMD64 and ARM64 installer pipelines pass with the new step.
- Release checklist updated with legal text verification.

---

## 6) Risks and Mitigations

- **Risk:** Legal text changes late in release cycle.
  - **Mitigation:** Keep text in a dedicated resource file, not inline in NSIS script.
- **Risk:** Path issues during cross-platform packaging.
  - **Mitigation:** Validate path in Task precondition before invoking `makensis`.
- **Risk:** Confusion between app open-source license and installer EULA.
  - **Mitigation:** Product/Legal sign-off on document type and wording.

---

## 7) Out of Scope

- Full legal drafting of EULA language.
- Localization/multi-language installer license pages (future enhancement).
