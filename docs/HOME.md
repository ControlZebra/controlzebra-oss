# ControlZebra Documentation

> **Version:** v0.13.0-beta | **Platform:** Windows (primary), macOS | **Stack:** Wails v3 + Go 1.26 + React 18 + TypeScript

ControlZebra is a simplified desktop Git client for **non-technical users** in industrial automation — PLC engineers, HMI designers, and automation teams who work with binary config files, ladder logic, and hardware schematics.

---

## Quick Navigation

### 🏁 Getting Started
- [[Onboarding Guide]] — Start here if you're new to the team
- [[Development Setup]] — Get your local environment running
- [[Architecture Overview]] — Understand how the app is built

### 📦 Product
- [[Product Overview]] — What ControlZebra is and who it's for
- [[Roadmap]] — Version milestones and future plans
- [[User-Facing Terminology]] — How we map Git concepts to plain English

### 🏗 Technical — Architecture
- [[Architecture Overview]] — System-level architecture (Wails, Go, React)
- [[Backend Architecture]] — Go services, CLI execution, data paths
- [[Frontend Architecture]] — React contexts, layout, component structure
- [[Event System]] — Backend ↔ Frontend communication
- [[State Management]] — How app state flows through contexts
- [[Viewer System]] — Pluggable file viewer & diff viewer registry

### 🔧 Technical — Backend Services
- [[Services Index]] — All 14 registered services at a glance
- [[GitService]] — Core git operations (115+ methods)
- [[LFSService]] — Git Large File Storage
- [[GitHubService]] — GitHub CLI wrapper & device-flow auth
- [[RepositorySettingsService]] — Per-repo config & background tasks
- [[SettingsService]] — App settings & git identity
- [[ProgressService]] — Git operation progress streaming
- [[FileWatcherService]] — Filesystem monitoring
- [[ConflictQueueService]] — Queue of files still needing a conflict decision
- [[FileSystemService]] — File operations & directory listing
- [[Other Services#ImageDiffService|ImageDiffService]] — Pixel-level image comparison
- [[Other Services#AuthService|AuthService]] — Supabase session keychain persistence
- [[Other Services#DebugService|DebugService]] — Runtime debug logging
- [[Other Services#LocalBinService|LocalBinService]] — Windows portable CLI toolchain

### ⚙️ Technical — Infrastructure
- [[CommandRunner]] — CLI execution engine
- [[CLI Resolver]] — Binary path resolution strategy
- [[Data Paths]] — XDG-compliant storage layout
- [[Debug Logger]] — Ring-buffer logging system
- [[Auto-Updater]] — Sidecar-based update system

### 🖥 Technical — Frontend
- [[Frontend Architecture]] — Component organization & patterns
- [[Layout System]] — VS Code-like shell (AppLayout, ActivityBar, Sidebar, MainArea)
- [[Context Providers]] — RepoContext, LayoutContext, AuthContext
- [[UI Components]] — shadcn-style Radix primitives
- [[Viewer System]] — File viewer & diff viewer registry
- Feature docs: [[Explorer Feature]], [[Feature Docs#History Feature|History Feature]], [[Feature Docs#Merge Feature|Merge Feature]], [[Feature Docs#Welcome Feature|Welcome Feature]]

### 📖 Guides
- [[Adding a New Service]] — Step-by-step guide for new Go services
- [[Adding a New View]] — Adding sidebar views & main area pages
- [[Adding a New Viewer]] — Creating file/diff viewers
- [[Git Workflows]] — All git operations with decision trees
- [[Build and Release]] — Build, package, sign, distribute
- [[Testing Guide]] — Backend & frontend testing patterns

### 🔁 Processes
- [[Development Workflow]] — Branch strategy, PR process, code review
- [[Release Process]] — How we cut releases
- [[Incident Response]] — What to do when things break
- [[Documentation Standards]] — How to maintain these docs

### 📋 Reference
- [[Environment Variables]] — All configurable env vars
- [[Event Reference]] — Complete event name catalog
- [[Constants Reference]] — Frontend constants & view IDs
- [[Data Storage Reference]] — File paths per platform

---

## Documentation Conventions

- **Cross-links** use Obsidian `[[Page Name]]` syntax
- **Code references** link to specific files: `services/git_service.go`
- **Architecture Decision Records** start with the date and context
- All user-facing text must use [[User-Facing Terminology]] — never raw Git jargon

---

*Last updated: March 2026*
