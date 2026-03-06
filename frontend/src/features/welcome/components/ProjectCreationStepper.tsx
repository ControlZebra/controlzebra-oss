/**
 * ProjectCreationStepper - Horizontal progress stepper for project creation and clone flows.
 *
 * Renders a series of steps with visual connectors.
 * Each step shows:
 *   - Completed:   green CheckCircle icon
 *   - In progress: blue spinning Loader2 icon
 *   - Pending:     gray Circle icon
 *   - Failed:      red XCircle icon + error message below
 *
 * Usage:
 *   <ProjectCreationStepper
 *     steps={[
 *       { id: 'init', label: 'Initializing' },
 *       { id: 'commit', label: 'Saving Changes' },
 *       { id: 'publish', label: 'Publishing' },
 *       { id: 'done', label: 'Done' },
 *     ]}
 *     currentStep={1}
 *     status="running"
 *   />
 */
import { memo, type CSSProperties } from 'react';
import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface StepDefinition {
  /** Unique identifier for the step. */
  id: string;
  /** Human-readable label displayed below the icon. */
  label: string;
}

export type StepperStatus = 'idle' | 'running' | 'success' | 'error';

export interface ProjectCreationStepperProps {
  /** Ordered list of steps to display. */
  steps: StepDefinition[];
  /** Zero-based index of the step currently active. */
  currentStep: number;
  /** Overall status of the stepper flow. */
  status: StepperStatus;
  /** Error message shown beneath the failed step when status === 'error'. */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ICON_SIZE = 20;

const iconStyle: CSSProperties = {
  width: ICON_SIZE,
  height: ICON_SIZE,
};

// ============================================================================
// Sub-components
// ============================================================================

/** A single step node: icon + label. */
function StepNode({
  label,
  state,
}: {
  label: string;
  state: 'completed' | 'active' | 'pending' | 'error';
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      {/* Icon */}
      <div className="flex items-center justify-center w-7 h-7">
        {state === 'completed' && (
          <CheckCircle style={iconStyle} className="text-green-400" />
        )}
        {state === 'active' && (
          <Loader2 style={iconStyle} className="text-blue-400 animate-spin" />
        )}
        {state === 'pending' && (
          <Circle style={iconStyle} className="text-gray-600" />
        )}
        {state === 'error' && (
          <XCircle style={iconStyle} className="text-red-400" />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-xs text-center leading-tight truncate max-w-[6rem] ${
          state === 'completed'
            ? 'text-green-400'
            : state === 'active'
              ? 'text-blue-400 font-medium'
              : state === 'error'
                ? 'text-red-400 font-medium'
                : 'text-gray-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/** Horizontal connector line between steps. */
function Connector({ completed }: { completed: boolean }) {
  return (
    <div
      className={`flex-1 h-px mx-1 mt-3.5 transition-colors duration-300 ${
        completed ? 'bg-green-500/60' : 'bg-gray-700'
      }`}
    />
  );
}

// ============================================================================
// Main component
// ============================================================================

function ProjectCreationStepper({
  steps,
  currentStep,
  status,
  error,
}: ProjectCreationStepperProps) {
  if (steps.length === 0) return null;

  return (
    <div className="w-full">
      {/* Step nodes + connectors */}
      <div className="flex items-start justify-between">
        {steps.map((step, index) => {
          // Determine the visual state for this step
          let state: 'completed' | 'active' | 'pending' | 'error';
          if (status === 'error' && index === currentStep) {
            state = 'error';
          } else if (status === 'success' && index <= currentStep) {
            // All steps up to (and including) currentStep are completed on success
            state = 'completed';
          } else if (index < currentStep) {
            state = 'completed';
          } else if (index === currentStep && status === 'running') {
            state = 'active';
          } else {
            state = 'pending';
          }

          return (
            <div key={step.id} className="contents">
              {/* Connector before this step (skip the first) */}
              {index > 0 && <Connector completed={index <= currentStep && status !== 'idle'} />}
              <StepNode label={step.label} state={state} />
            </div>
          );
        })}
      </div>

      {/* Error message (shown below the failed step) */}
      {status === 'error' && error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}

export default memo(ProjectCreationStepper);
