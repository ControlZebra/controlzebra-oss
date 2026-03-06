/**
 * ProgressModal - Modal overlay for git/lfs operations with progress bar.
 * Blocks all user interaction while operation is in progress.
 * Shows indeterminate spinner initially, then progress bar when percentage is available.
 */
import { memo, useEffect, useState, useRef } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Events } from "@wailsio/runtime";
import { cn } from "../../lib/utils";
import { Progress } from "./progress";

// Debounce interval for progress updates (ms)
const DEBOUNCE_MS = 50;

interface ProgressEventData {
  operationId: string;
  phase?: string;
  percent?: number;
  message?: string;
  isComplete?: boolean;
  success?: boolean;
  error?: string;
}

interface ProgressModalProps {
  isOpen: boolean;
  operationId: string;
  title?: string;
  onComplete?: (success: boolean, error?: string) => void;
}

/**
 * ProgressModal - Displays a blocking modal during git operations.
 */
function ProgressModal({ isOpen, operationId, title = "Processing...", onComplete }: ProgressModalProps) {
  const [phase, setPhase] = useState("starting");
  const [percent, setPercent] = useState(-1); // -1 = indeterminate
  const [message, setMessage] = useState("Initializing...");
  const [isComplete, setIsComplete] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Debounce ref
  const lastUpdateRef = useRef(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens with new operation
  useEffect(() => {
    if (isOpen && operationId) {
      setPhase("starting");
      setPercent(-1);
      setMessage("Initializing...");
      setIsComplete(false);
      setSuccess(false);
      setError("");
    }
  }, [isOpen, operationId]);

  // Listen for progress events
  useEffect(() => {
    if (!isOpen || !operationId) return;

    const handleProgress = (event: { data: ProgressEventData }) => {
      const data = event.data;

      // Only handle events for our operation
      if (data.operationId !== operationId) return;

      // Debounce non-completion updates
      if (!data.isComplete) {
        const now = Date.now();
        if (now - lastUpdateRef.current < DEBOUNCE_MS) {
          // Schedule a delayed update
          if (pendingUpdateRef.current) {
            clearTimeout(pendingUpdateRef.current);
          }
          pendingUpdateRef.current = setTimeout(() => {
            if (data.phase) setPhase(data.phase);
            if (data.percent !== undefined) setPercent(data.percent);
            if (data.message) setMessage(data.message);
            lastUpdateRef.current = Date.now();
          }, DEBOUNCE_MS);
          return;
        }
        lastUpdateRef.current = now;
      }

      // Apply update
      if (data.phase) setPhase(data.phase);
      if (data.percent !== undefined) setPercent(data.percent);
      if (data.message) setMessage(data.message);

      // Handle completion
      if (data.isComplete) {
        setIsComplete(true);
        setSuccess(data.success ?? false);
        if (data.error) setError(data.error);

        // Clear any pending debounced update
        if (pendingUpdateRef.current) {
          clearTimeout(pendingUpdateRef.current);
        }
      }
    };

    const unsubscribe = Events.On("git-progress", handleProgress);

    return () => {
      unsubscribe();
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [isOpen, operationId]);

  // Call onComplete after showing result briefly
  useEffect(() => {
    if (isComplete && onComplete) {
      const timer = setTimeout(() => {
        onComplete(success, error || undefined);
      }, success ? 800 : 1500); // Show success briefly, error a bit longer

      return () => clearTimeout(timer);
    }
  }, [isComplete, success, error, onComplete]);

  if (!isOpen) return null;

  const isIndeterminate = percent < 0;
  const displayPercent = isIndeterminate ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop - blocks all clicks */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal content */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-theme-surface border border-theme-default rounded-lg shadow-2xl p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            {isComplete ? (
              success ? (
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
              )
            ) : (
              <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
            )}
            <h2 className="text-lg font-medium text-theme-primary">{title}</h2>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            {isIndeterminate && !isComplete ? (
              // Indeterminate progress - animated gradient
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-theme-muted">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-indeterminate" />
              </div>
            ) : (
              <Progress
                value={isComplete && success ? 100 : displayPercent}
                variant={isComplete ? (success ? "success" : "error") : "default"}
              />
            )}
          </div>

          {/* Phase label */}
          <div className="text-sm text-theme-secondary capitalize mb-2">
            {phase.replace(/-/g, " ")}
          </div>

          {/* Status message */}
          <div
            className={cn(
              "text-sm break-words",
              isComplete && !success ? "text-red-600 dark:text-red-400" : "text-theme-secondary"
            )}
          >
            {isComplete && error ? error : message}
          </div>

          {/* Completion indicator */}
          {isComplete && (
            <div
              className={cn(
                "mt-4 text-sm font-medium text-center",
                success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              )}
            >
              {success ? "Complete!" : "Operation failed"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ProgressModal);
