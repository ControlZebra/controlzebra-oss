# Rewind Logic

## Introduction

Read me logic is a desktop git client for specialized so usecases such as industrial automation software.

This is a minimal git client that can simplify git operations (in opinionated ways) and allow the review of Industrial Automation configuration files (PLC, HMI, actuator configs, etc.).

## Features
- Connect with GitHub & GitLab
- Central YAML configuration file to add custom git CLI commands

## Git Commands
Support for the following git operations:

| Git Command / Action                | Recommended Label           | Why for Non-Techs?                                                                                  |
|-------------------------------------|----------------------------|-----------------------------------------------------------------------------------------------------|
| `git pull`                          | Sync / Get Updates         | Users don't care about "fetching vs merging"; they just want the latest work.                       |
| `git add .` + `git commit`          | Save Changes               | Combine these. Staging is a confusing concept for beginners.                                        |
| `git push`                          | Share / Upload             | "Push" is technical jargon; "Share" implies collaboration.                                          |
| `git status`                        | Current Activity           | Use this to show a simple list of "Changed Files."                                                  |
| `git checkout -b [name]`            | Start New Task             | Branching is where most beginners get stuck. Prompt for a simple name like "fix-login-bug".         |
| `git checkout [branch]`             | Switch Task                | A visual list of recent branches.                                                                   |
| `git merge [branch]`                | Bring changes into Main    | Instead of "Merge," use "Bring changes into Main."                                                  |
| `git checkout -- .`                 | Discard My Changes         | A "panic button" to revert local files to the last saved state.                                     |
| `git reset --soft HEAD~1`           | Undo Last Save             | For when they made a typo in the commit message or forgot a file.                                   |
| (UI version of `git merge`)         | Conflict Helper            | When a conflict happens, provide a side-by-side view with "Keep Mine" or "Keep Theirs" buttons.     |
| `git config user.name/email`        | Identify Yourself          | A simple form on the first launch to set your name and email.                                       |
| `git remote add` (with OAuth)       | Connect Account            | Use OAuth (GitHub/GitLab) so they don't have to manage SSH keys.                                    |

