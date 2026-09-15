import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllTabStates } from './l5x/useTabs';
import { clearViewerCache, getCachedContent } from '../../registry/viewer-cache';
import L5XViewer from './L5XViewer';

const {
  readTextFileMock,
  parseStringMock,
  onEventMock,
  registerAOIsFromControllerMock,
  clearAOIsMock,
} = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
  parseStringMock: vi.fn(),
  onEventMock: vi.fn(),
  registerAOIsFromControllerMock: vi.fn(),
  clearAOIsMock: vi.fn(),
}));

let filesChangedHandler: ((event: {
  data?: {
    path?: string;
    eventType?: string;
    isDir?: boolean;
  };
}) => void) | null = null;

vi.mock('../../../../bindings/controlzebra/services/filesystemservice', () => ({
  ReadTextFile: readTextFileMock,
}));

vi.mock('../../../context/LayoutContext', () => ({
  useLayout: () => ({ theme: 'light' }),
}));

vi.mock('../../../shared/runtime/events', () => ({
  onEvent: onEventMock,
}));

vi.mock('../shared/ViewerHeader', () => ({
  ViewerHeader: ({ filePath }: { filePath: string }) => <div data-testid="viewer-header">{filePath}</div>,
}));

vi.mock('ladder-visualizer', () => ({
  parseString: parseStringMock,
  VirtualizedLadderDiagram: ({ routine }: { routine: { name: string; versionTag?: string } }) => (
    <div>{`RLL:${routine.name}@${routine.versionTag ?? 'unknown'}`}</div>
  ),
  ProgramNavigator: ({
    programs,
    selectedRoutine,
    onRoutineSelect,
  }: {
    programs: Array<{ routines: Array<{ name: string; versionTag?: string }> }>;
    selectedRoutine?: { programIndex: number; routineIndex: number };
    onRoutineSelect: (programIndex: number, routineIndex: number, routine: { name: string; versionTag?: string }) => void;
  }) => (
    <div>
      <div data-testid="selected-routine">
        {selectedRoutine ? `${selectedRoutine.programIndex}:${selectedRoutine.routineIndex}` : 'none'}
      </div>
      <button type="button" onClick={() => onRoutineSelect(0, 0, programs[0]?.routines[0])}>
        Open Routine
      </button>
    </div>
  ),
  ControllerInfo: () => <div>Controller Info</div>,
  TagTable: () => <div>Tag Table</div>,
  StructuredTextViewer: ({ routine }: { routine: { name: string; versionTag?: string } }) => (
    <div>{`ST:${routine.name}@${routine.versionTag ?? 'unknown'}`}</div>
  ),
  AOIParameterTable: () => <div>AOI Parameters</div>,
  AOILocalTagTable: () => <div>AOI Local Tags</div>,
  ModuleInfoTable: () => <div>Module Info</div>,
  registerAOIsFromController: registerAOIsFromControllerMock,
  clearAOIs: clearAOIsMock,
  DARK_THEME: {},
}));

function makeController(versionTag: string, options?: { includeRoutine?: boolean }) {
  const includeRoutine = options?.includeRoutine ?? true;

  return {
    name: `Controller ${versionTag}`,
    programs: [
      {
        name: 'MainProgram',
        tags: [],
        routines: includeRoutine
          ? [
              {
                name: 'RoutineA',
                type: 'RLL',
                versionTag,
              },
            ]
          : [],
      },
    ],
    tags: [],
    dataTypes: [],
    aois: [],
    modules: [],
  };
}

function queueSuccessfulRead(contents: string[]) {
  readTextFileMock.mockReset();
  contents.forEach((content) => {
    readTextFileMock.mockResolvedValueOnce({
      success: true,
      content,
    });
  });
}

async function emitFilesChanged(path: string, eventType: string, isDir = false) {
  if (!filesChangedHandler) {
    throw new Error('files-changed handler has not been registered');
  }

  await act(async () => {
    filesChangedHandler?.({
      data: {
        path,
        eventType,
        isDir,
      },
    });
  });
}

async function renderLoadedViewer(filePath = '/repo/Programs/Main.L5X') {
  render(<L5XViewer filePath={filePath} />);
  await screen.findByText('No Content Selected');
}

describe('L5XViewer refresh behavior', () => {
  beforeEach(() => {
    filesChangedHandler = null;
    clearViewerCache();
    clearAllTabStates();
    vi.clearAllMocks();

    onEventMock.mockImplementation((eventName: string, handler: typeof filesChangedHandler) => {
      if (eventName === 'files-changed') {
        filesChangedHandler = handler;
      }
      return vi.fn();
    });

    parseStringMock.mockImplementation((content: string) => ({
      success: true,
      data: makeController(content),
      errors: [],
    }));
  });

  it('reads and parses the file once on initial render', async () => {
    queueSuccessfulRead(['v1']);

    await renderLoadedViewer();

    expect(readTextFileMock).toHaveBeenCalledTimes(1);
    expect(readTextFileMock).toHaveBeenCalledWith('/repo/Programs/Main.L5X');
    expect(parseStringMock).toHaveBeenCalledTimes(1);
    expect(getCachedContent('/repo/Programs/Main.L5X')).toMatchObject({
      name: 'Controller v1',
    });
  });

  it('ignores files-changed events for other files', async () => {
    queueSuccessfulRead(['v1']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Other.L5X', 'write');

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(1);
      expect(parseStringMock).toHaveBeenCalledTimes(1);
    });
  });

  it('reloads after a matching write event and replaces the cached controller', async () => {
    queueSuccessfulRead(['v1', 'v2']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(2);
      expect(parseStringMock).toHaveBeenCalledTimes(2);
      expect(getCachedContent('/repo/Programs/Main.L5X')).toMatchObject({
        name: 'Controller v2',
      });
    });
  });

  it.each(['rename', 'remove'])('reloads after a matching %s event', async (eventType) => {
    queueSuccessfulRead(['v1', 'v2']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Main.L5X', eventType);

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(2);
      expect(parseStringMock).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves the selected routine across reload when the routine still exists', async () => {
    queueSuccessfulRead(['v1', 'v2']);

    await renderLoadedViewer();

    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    expect(await screen.findByText('RLL:RoutineA@v1')).toBeInTheDocument();
    expect(screen.getByTestId('selected-routine')).toHaveTextContent('0:0');

    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');

    expect(await screen.findByText('RLL:RoutineA@v2')).toBeInTheDocument();
    expect(screen.getByTestId('selected-routine')).toHaveTextContent('0:0');
  });

  it('degrades cleanly when the preserved selection no longer exists after reload', async () => {
    queueSuccessfulRead(['v1', 'missing']);
    parseStringMock
      .mockReset()
      .mockImplementationOnce(() => ({
        success: true,
        data: makeController('v1'),
        errors: [],
      }))
      .mockImplementationOnce(() => ({
        success: true,
        data: makeController('missing', { includeRoutine: false }),
        errors: [],
      }));

    await renderLoadedViewer();

    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    expect(await screen.findByText('RLL:RoutineA@v1')).toBeInTheDocument();

    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');

    expect(await screen.findByText('Routine not found')).toBeInTheDocument();
  });
});