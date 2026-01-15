/**
 * Type definitions for RepoContext
 * 
 * These types are derived from:
 * - Backend service models (frontend/bindings/changeme/services/models.js)
 * - Component prop types
 * - React state shape analysis
 */

import type { ReactNode, Dispatch, SetStateAction } from 'react';

// ============================================================================
// Enums and Constants
// ============================================================================

export type FileStatusType = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
export type ConflictFileStatus = 'both-modified' | 'deleted-by-us' | 'deleted-by-them' | 'both-added';
export type ResolutionStrategy = 'mine' | 'theirs' | 'both';
export type MessageType = 'success' | 'error' | 'info' | 'warning';

// ============================================================================
// Backend Model Types (from services/models.js)
// ============================================================================

/**
 * RepoInfo - Basic repository information from DetectRepo()
 */
export interface RepoInfo {
  path: string;
  isRepo: boolean;
  branch: string;
  hasError: boolean;
  error?: string;
}

/**
 * FileStatus - Status of a changed file from git status
 */
export interface FileStatus {
  path: string;
  name: string;
  status: FileStatusType;
}

/**
 * RepoStatus - Current state of the repository from Status()
 */
export interface RepoStatus {
  branch: string;
  ahead: number;
  behind: number;
  changedFiles: FileStatus[];
  hasChanges: boolean;
  hasUpstream: boolean;
  totalLocalCommits: number;
  hasError: boolean;
  error?: string;
}

/**
 * GraphCommit - Commit with parent references for graph visualization
 */
export interface GraphCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  relativeDate: string;
  parents: string[];
  refs: string[];
}

/**
 * CommitStats - Statistics for a commit
 */
export interface CommitStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

/**
 * CommitFileInfo - File changed in a commit
 */
export interface CommitFileInfo {
  path: string;
  oldPath?: string;
  status: string;
  additions: number;
  deletions: number;
}

/**
 * CommitDetail - Detailed information about a single commit from ShowCommit()
 */
export interface CommitDetail {
  hash: string;
  shortHash: string;
  message: string;
  body?: string;
  author: string;
  authorEmail: string;
  date: string;
  relativeDate: string;
  parentHashes: string[];
  files: CommitFileInfo[];
  stats: CommitStats;
  hasError: boolean;
  error?: string;
}

/**
 * BranchInfo - Git branch information
 */
export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
}

/**
 * BranchList - All branches in a repository from Branches()
 */
export interface BranchList {
  current: string;
  local: BranchInfo[];
  remote: BranchInfo[];
  hasError: boolean;
  error?: string;
}

/**
 * FileDiff - Diff information for a file
 */
export interface FileDiff {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary?: boolean;
  rawDiff?: string;
  hasError?: boolean;
  error?: string;
}

/**
 * ConflictedFile - File with merge conflicts
 */
export interface ConflictedFile {
  path: string;
  status: ConflictFileStatus;
}

/**
 * ConflictCommitInfo - Minimal commit info for conflict resolution display
 */
export interface ConflictCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * ConflictSidesInfo - Commit info for both sides of a conflict
 */
export interface ConflictSidesInfo {
  ours: ConflictCommitInfo;
  theirs: ConflictCommitInfo;
  success: boolean;
  error?: string;
}

/**
 * BranchConflictCheckResult - Result of checking for conflicts between branches
 */
export interface BranchConflictCheckResult {
  hasConflicts: boolean;
  conflictedFiles: ConflictedFile[];
  parentBranch: string;
  targetBranch: string;
  sourceBranch: string;
  success: boolean;
  error?: string;
  message?: string;
  // Extended fields added by frontend
  isSquashMerge?: boolean;
  mergeStarted?: boolean;
  alreadyUpToDate?: boolean;
  autoCompleted?: boolean;
}

/**
 * MergeState - Current repository operation state
 */
export interface MergeState {
  inMerge: boolean;
  inRebase: boolean;
  hasConflicts: boolean;
  message?: string;
  // Additional stuck states
  inCherryPick: boolean;
  inRevert: boolean;
  inBisect: boolean;
  inAM: boolean;
  isDetached: boolean;
  hasLockFile: boolean;
  // Additional context
  detachedAt?: string;
  lockFiles?: string[];
  stuckType?: string;
  userMessage?: string;
}

/**
 * OperationResult - Generic result from a git operation
 */
export interface OperationResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * DetectedParentBranch - Auto-detected parent branch info
 */
export interface DetectedParentBranch {
  name: string;
  source: string;
}

/**
 * ParentBranchResult - Result from GetParentBranch()
 */
export interface ParentBranchResult {
  parentBranch: string;
  source?: string;
}

/**
 * BisectState - Current bisect operation state
 */
export interface BisectState {
  inProgress: boolean;
  currentCommit?: string;
  goodCommits?: string[];
  badCommits?: string[];
  stepsRemaining?: number;
}

// ============================================================================
// Progress Modal Types
// ============================================================================

export interface ProgressModalState {
  isOpen: boolean;
  operationId: string | null;
  title: string;
}

// ============================================================================
// File Resolutions Map
// ============================================================================

export type FileResolutionsMap = Record<string, ResolutionStrategy>;

// ============================================================================
// Merge Options
// ============================================================================

export interface MergeOptions {
  squash?: boolean;
}

// ============================================================================
// Start Merge Result
// ============================================================================

export interface StartMergeResult {
  success: boolean;
  hasConflicts?: boolean;
  alreadyUpToDate?: boolean;
  autoCompleted?: boolean;
}

// ============================================================================
// Context Value Type
// ============================================================================

export interface RepoContextValue {
  // ===== State =====
  repoPath: string | null;
  repoInfo: RepoInfo | null;
  repoStatus: RepoStatus | null;
  commits: GraphCommit[]; // Alias for graphCommits
  graphCommits: GraphCommit[];
  branches: BranchList | null;
  selectedFileIndex: number | null;
  setSelectedFileIndex: Dispatch<SetStateAction<number | null>>;

  // v2: Selection state
  selectedCommit: CommitDetail | null;
  selectedCommitFile: string | null;
  currentDiff: FileDiff | null;

  // Loading states
  isLoading: boolean;
  isSyncing: boolean;
  isCommitting: boolean;
  isDiffLoading: boolean;

  // Progress modal state
  progressModal: ProgressModalState;
  handleProgressComplete: (success: boolean, error?: string) => void;

  // Feedback
  showMessage: (type: MessageType, text: string, duration?: number) => void;

  // ===== Actions =====
  openRepo: (path: string) => Promise<boolean>;
  closeRepo: () => Promise<void>;
  initializeGitRepo: () => Promise<boolean>;
  commitChanges: (message: string) => Promise<boolean>;
  syncRepo: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  refreshCommits: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // v2: Diff actions
  loadWorkingDiff: (filePath: string) => Promise<void>;
  selectCommit: (commitHash: string) => Promise<void>;
  loadCommitFileDiff: (filePath: string) => Promise<void>;
  clearSelection: () => void;

  // v2: Branch actions
  refreshBranches: () => Promise<void>;
  switchBranch: (branchName: string) => Promise<boolean>;
  createBranch: (branchName: string) => Promise<boolean>;
  branchAndCommit: (branchName: string, message: string) => Promise<boolean>;

  // v2: Recovery actions
  undoLastCommit: () => Promise<boolean>;
  discardAllChanges: () => Promise<boolean>;
  discardFileChanges: (filePath: string) => Promise<boolean>;
  rewindToLastSnapshot: () => Promise<boolean>;

  // v2: Conflict checking actions
  conflictedFiles: ConflictedFile[];
  selectedConflictFile: string | null;
  setSelectedConflictFile: Dispatch<SetStateAction<string | null>>;
  conflictCheckResult: BranchConflictCheckResult | null;
  isCheckingConflicts: boolean;
  checkConflictsOnly: (targetBranch?: string, sourceBranch?: string, options?: MergeOptions) => Promise<BranchConflictCheckResult | null>;
  startMerge: (targetBranch?: string, sourceBranch?: string, options?: MergeOptions) => Promise<StartMergeResult | null>;
  checkBranchConflicts: (targetBranch?: string, sourceBranch?: string, options?: MergeOptions) => Promise<BranchConflictCheckResult | null>;
  clearConflicts: () => void;
  detectedParentBranch: DetectedParentBranch | null;
  fetchParentBranch: () => Promise<ParentBranchResult | null>;
  conflictSidesInfo: ConflictSidesInfo | null;

  // v2: Merge options
  isSquashMerge: boolean;
  setIsSquashMerge: Dispatch<SetStateAction<boolean>>;

  // v2: Conflict resolution actions
  fileResolutions: FileResolutionsMap;
  setFileResolution: (filePath: string, strategy: ResolutionStrategy) => void;
  mergeState: MergeState | null;
  isResolvingConflict: boolean;
  resolveConflict: (filePath: string, strategy: ResolutionStrategy) => Promise<boolean>;
  applyAllResolutions: () => Promise<boolean>;
  abortMerge: () => Promise<boolean>;
  completeMerge: (message: string) => Promise<boolean>;
  refreshMergeState: () => Promise<MergeState | null>;

  // v2: Stuck state recovery actions
  abortCurrentOperation: () => Promise<boolean>;
  // Cherry-pick
  abortCherryPick: () => Promise<boolean>;
  continueCherryPick: () => Promise<boolean>;
  skipCherryPickCommit: () => Promise<boolean>;
  // Revert
  abortRevert: () => Promise<boolean>;
  continueRevert: () => Promise<boolean>;
  skipRevertCommit: () => Promise<boolean>;
  // Bisect
  abortBisect: () => Promise<boolean>;
  getBisectState: () => Promise<BisectState | null>;
  // AM (patch)
  abortAM: () => Promise<boolean>;
  skipAMPatch: () => Promise<boolean>;
  // Detached HEAD
  createBranchFromDetached: (branchName: string) => Promise<boolean>;
  // Lock files
  removeAllStaleLocks: () => Promise<boolean>;
}

// ============================================================================
// Provider Props
// ============================================================================

export interface RepoProviderProps {
  children: ReactNode;
}
