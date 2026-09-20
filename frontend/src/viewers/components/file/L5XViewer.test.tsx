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
  fbdDiagramMock,
  tagTableMock,
  testState,
} = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
  parseStringMock: vi.fn(),
  onEventMock: vi.fn(),
  registerAOIsFromControllerMock: vi.fn(),
  clearAOIsMock: vi.fn(),
  fbdDiagramMock: vi.fn(),
  tagTableMock: vi.fn((_props: unknown) => <div>Tag Table</div>),
  testState: {
    theme: 'light' as 'light' | 'dark',
    themeListeners: new Set<() => void>(),
  },
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

vi.mock('../../../context/LayoutContext', async () => {
  const React = await import('react');
  return {
    useLayout: () => ({
      theme: React.useSyncExternalStore(
        (listener) => {
          testState.themeListeners.add(listener);
          return () => testState.themeListeners.delete(listener);
        },
        () => testState.theme,
        () => testState.theme,
      ),
    }),
  };
});

vi.mock('../../../shared/runtime/events', () => ({
  onEvent: onEventMock,
}));

vi.mock('../shared/ViewerHeader', () => ({
  ViewerHeader: ({ filePath }: { filePath: string }) => <div data-testid="viewer-header">{filePath}</div>,
}));

vi.mock('ladder-visualizer', () => {
  fbdDiagramMock.mockImplementation(({
    body,
    onDiagnostics,
    sheetIndex = 0,
    onSheetIndexChange,
  }: {
    body: { versionTag?: string };
    onDiagnostics?: (diagnostics: Array<{ code: string; message: string; severity: string }>) => void;
    sheetIndex?: number;
    onSheetIndexChange?: (sheetIndex: number) => void;
  }) => {
    return (
      <div data-testid="fbd-diagram">
        <div>{`FBD:${body.versionTag ?? 'unknown'}:sheet-${sheetIndex}`}</div>
        <button type="button" aria-label="Zoom in">Zoom in</button>
        <button type="button" aria-label="Zoom out">Zoom out</button>
        <button type="button" aria-label="Fit view">Fit view</button>
        <button type="button" onClick={() => onSheetIndexChange?.(sheetIndex + 1)}>
          Next FBD sheet
        </button>
        <button
          type="button"
          onClick={() => onDiagnostics?.([{
            code: 'FBD_PLACEHOLDER_ELEMENT',
            message: 'Unsupported element rendered as a placeholder.',
            severity: 'warning',
          }])}
        >
          Report FBD diagnostic
        </button>
      </div>
    );
  });

  return {
    parseString: parseStringMock,
    VirtualizedLadderDiagram: ({ routine }: { routine: { name: string; versionTag?: string } }) => (
      <div>{`RLL:${routine.name}@${routine.versionTag ?? 'unknown'}`}</div>
    ),
    FBDDiagram: fbdDiagramMock,
    ProgramNavigator: ({
      controller,
      programs,
      selectedRoutine,
      onRoutineSelect,
      onControllerTagsSelect,
      onProgramTagsSelect,
      onControllerInfoSelect,
      onDataTypeSelect,
      onAOIRoutineSelect,
    }: {
      controller: {
        aois: Array<{ name: string; routines: Array<{ name: string; versionTag?: string }> }>;
        dataTypeCatalog?: Array<{ name: string }>;
        dataTypes: Array<{ name: string }>;
      };
      programs: Array<{ routines: Array<{ name: string; versionTag?: string }> }>;
      selectedRoutine?: { programIndex: number; routineIndex: number };
      onRoutineSelect: (programIndex: number, routineIndex: number, routine: { name: string; versionTag?: string }) => void;
      onControllerTagsSelect: () => void;
      onProgramTagsSelect: (programIndex: number) => void;
      onControllerInfoSelect: () => void;
      onDataTypeSelect: (dataType: { name: string }) => void;
      onAOIRoutineSelect: (aoi: { name: string; routines: Array<{ name: string; versionTag?: string }> }, routineIndex: number, routine: { name: string; versionTag?: string }) => void;
    }) => (
      <div>
        <div data-testid="selected-routine">
          {selectedRoutine ? `${selectedRoutine.programIndex}:${selectedRoutine.routineIndex}` : 'none'}
        </div>
        <button type="button" onClick={() => onRoutineSelect(0, 0, programs[0]?.routines[0])}>
          Open Routine
        </button>
        <button type="button" onClick={onControllerTagsSelect}>Open Controller Tags</button>
        <button type="button" onClick={() => onProgramTagsSelect(0)}>Open Program Tags</button>
        <button type="button" onClick={onControllerInfoSelect}>Open Controller Info</button>
        {(controller.dataTypeCatalog ?? controller.dataTypes)[0] && (
          <button
            type="button"
            onClick={() => onDataTypeSelect((controller.dataTypeCatalog ?? controller.dataTypes)[0])}
          >
            Open Data Type
          </button>
        )}
        {controller.aois[0]?.routines[0] && (
          <button
            type="button"
            onClick={() => onAOIRoutineSelect(
              controller.aois[0],
              0,
              controller.aois[0].routines[0],
            )}
          >
            Open AOI Routine
          </button>
        )}
      </div>
    ),
    ControllerInfo: () => <div>Controller Info</div>,
    TagTable: tagTableMock,
    StructuredTextViewer: ({ routine }: { routine: { name: string; versionTag?: string } }) => (
      <div>{`ST:${routine.name}@${routine.versionTag ?? 'unknown'}`}</div>
    ),
    AOIParameterTable: () => <div>AOI Parameters</div>,
    AOILocalTagTable: () => <div>AOI Local Tags</div>,
    ModuleInfoTable: () => <div>Module Info</div>,
    registerAOIsFromController: registerAOIsFromControllerMock,
    clearAOIs: clearAOIsMock,
    DARK_THEME: { name: 'dark-theme' },
  };
});

function makeFBDBody(versionTag: string) {
  return {
    versionTag,
    sheetSize: { value: 'D', source: 'declared' },
    orientation: { value: 'Landscape', source: 'declared' },
    sheets: [
      {
        number: { value: '1', source: 'declared' },
        name: { value: 'Sheet 1', source: 'declared' },
        descriptions: [],
        elements: [],
        connections: [],
        attachments: [],
      },
      {
        number: { value: '2', source: 'declared' },
        name: { value: 'Sheet 2', source: 'declared' },
        descriptions: [],
        elements: [],
        connections: [],
        attachments: [],
      },
    ],
    diagnostics: [],
  };
}

function makeRoutine(name: string, type: 'RLL' | 'FBD' | 'ST' | 'SFC', versionTag: string) {
  return {
    name,
    type,
    versionTag,
    rungs: [],
    ...(type === 'FBD' ? { fbd: makeFBDBody(versionTag) } : {}),
  };
}

function makeController(
  versionTag: string,
  options?: {
    includeRoutine?: boolean;
    routineType?: 'RLL' | 'FBD' | 'ST' | 'SFC';
    includeAOIFBD?: boolean;
    includeDataTypes?: boolean;
  },
) {
  const includeRoutine = options?.includeRoutine ?? true;
  const routineType = options?.routineType ?? 'RLL';

  return {
    name: `Controller ${versionTag}`,
    programs: [
      {
        name: 'MainProgram',
        tags: [] as Array<{ name: string; dataType: string }>,
        routines: includeRoutine
          ? [makeRoutine('RoutineA', routineType, versionTag)]
          : [],
      },
    ],
    tags: [] as Array<{ name: string; dataType: string }>,
    dataTypes: [],
    dataTypeCatalog: options?.includeDataTypes
      ? [
          {
            name: 'PumpState',
            class: 'User',
            category: 'UserDefined',
            resolution: 'Declared',
            description: 'Current pump operating state.',
            members: [{
              name: 'Mode',
              dataType: 'DINT',
              dimension: 0,
              dimensions: [],
              description: 'State code.',
            }],
          },
          {
            name: 'DINT',
            class: 'BuiltIn',
            category: 'Predefined',
            resolution: 'Atomic',
            members: [],
          },
        ]
      : [],
    aois: options?.includeAOIFBD
      ? [{
          name: 'MixerAOI',
          parameters: [],
          localTags: [],
          routines: [makeRoutine('Logic', 'FBD', `AOI-${versionTag}`)],
        }]
      : [],
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

function latestFBDDiagramProps() {
  const calls = fbdDiagramMock.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe('L5XViewer refresh behavior', () => {
  beforeEach(() => {
    filesChangedHandler = null;
    testState.theme = 'light';
    testState.themeListeners.clear();
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

  it('opens catalog data types and follows nested type selections in tabs', async () => {
    queueSuccessfulRead(['v1']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { includeDataTypes: true }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Data Type' }));

    expect(await screen.findByRole('heading', { name: 'PumpState' })).toBeInTheDocument();
    expect(screen.getByText('Current pump operating state.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open DINT' }));
    expect(await screen.findByRole('heading', { name: 'DINT' })).toBeInTheDocument();
    expect(screen.getByText('This is an atomic data type with no member structure.')).toBeInTheDocument();
  });

  it('supplies the complete data type catalog to controller and program tag tables', async () => {
    queueSuccessfulRead(['v1']);
    const controller = makeController('v1', { includeDataTypes: true });
    controller.tags = [{ name: 'ControllerRaw', dataType: 'PumpState' }];
    controller.programs[0].tags = [{ name: 'ProgramRaw', dataType: 'PumpState' }];
    parseStringMock.mockReturnValue({ success: true, data: controller, errors: [] });

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Controller Tags' }));

    expect(tagTableMock.mock.calls[tagTableMock.mock.calls.length - 1]?.[0]).toMatchObject({
      tags: controller.tags,
      dataTypes: controller.dataTypeCatalog,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Program Tags' }));
    expect(tagTableMock.mock.calls[tagTableMock.mock.calls.length - 1]?.[0]).toMatchObject({
      tags: controller.programs[0].tags,
      dataTypes: controller.dataTypeCatalog,
    });
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

  it('renders a program-owned FBD through the normalized routine viewer configuration', async () => {
    queueSuccessfulRead(['v1']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { routineType: 'FBD' }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));

    expect(await screen.findByText('FBD:v1:sheet-0')).toBeInTheDocument();
    expect(screen.queryByText(/FBD.*not yet supported/i)).not.toBeInTheDocument();

    const props = latestFBDDiagramProps();
    expect(props).toMatchObject({
      body: { versionTag: 'v1' },
      width: '100%',
      height: '100%',
      className: 'h-full w-full',
      showControls: true,
      showBackground: true,
      showMiniMap: false,
      interactive: true,
      theme: { bgPrimary: 'var(--color-bg-surface)' },
      sheetIndex: 0,
    });
    expect(props.onDiagnostics).toEqual(expect.any(Function));
    expect(screen.getAllByRole('button', { name: 'Zoom in' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Zoom out' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Fit view' })).toHaveLength(1);
  });

  it('renders an AOI-owned FBD through the same viewer configuration', async () => {
    queueSuccessfulRead(['v1']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { includeAOIFBD: true }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open AOI Routine' }));

    expect(await screen.findByText('FBD:AOI-v1:sheet-0')).toBeInTheDocument();
    expect(latestFBDDiagramProps()).toMatchObject({
      body: { versionTag: 'AOI-v1' },
      width: '100%',
      height: '100%',
      className: 'h-full w-full',
      showControls: true,
      showBackground: true,
      showMiniMap: false,
      interactive: true,
    });
  });

  it('maps nonfatal FBD diagnostics into the viewer warning presentation without reparsing', async () => {
    queueSuccessfulRead(['v1']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { routineType: 'FBD' }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    await screen.findByText('FBD:v1:sheet-0');
    fireEvent.click(screen.getByRole('button', { name: 'Report FBD diagnostic' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 FBD diagnostic: Unsupported element rendered as a placeholder.',
    );
    expect(parseStringMock).toHaveBeenCalledTimes(1);
  });

  it('preserves FBD sheet state across app-tab switches and file refreshes', async () => {
    queueSuccessfulRead(['v1', 'v2']);
    parseStringMock.mockImplementation((content: string) => ({
      success: true,
      data: makeController(content, { routineType: 'FBD' }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    await screen.findByText('FBD:v1:sheet-0');
    fireEvent.click(screen.getByRole('button', { name: 'Next FBD sheet' }));
    expect(await screen.findByText('FBD:v1:sheet-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Controller Info' }));
    expect(screen.getByTitle('Controller Info')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('RoutineA'));
    expect(screen.getByText('FBD:v1:sheet-1')).toBeInTheDocument();

    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('FBD:v2:sheet-1')).toBeInTheDocument();
    expect(getCachedContent('/repo/Programs/Main.L5X')).toMatchObject({
      name: 'Controller v2',
    });
  });

  it('updates the FBD theme when the application theme changes', async () => {
    queueSuccessfulRead(['v1']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { routineType: 'FBD' }),
      errors: [],
    }));

    render(<L5XViewer filePath="/repo/Programs/Main.L5X" />);
    await screen.findByText('No Content Selected');
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    await screen.findByText('FBD:v1:sheet-0');
    expect(latestFBDDiagramProps().theme).toMatchObject({
      bgPrimary: 'var(--color-bg-surface)',
    });

    act(() => {
      testState.theme = 'dark';
      testState.themeListeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(latestFBDDiagramProps().theme).toEqual({ name: 'dark-theme' });
    });
  });

  it('surfaces fatal FBD online-edit rejection through the existing parse error path', async () => {
    queueSuccessfulRead(['online-edit']);
    parseStringMock.mockReturnValue({
      success: false,
      errors: [{ message: 'Unsupported FBD online-edit representation.' }],
    });

    render(<L5XViewer filePath="/repo/Programs/Main.L5X" />);

    expect(await screen.findByText('Cannot parse L5X file')).toBeInTheDocument();
    expect(screen.getByText('Unsupported FBD online-edit representation.')).toBeInTheDocument();
    expect(fbdDiagramMock).not.toHaveBeenCalled();
  });

  it('keeps ST rendering and unsupported routine messaging unchanged', async () => {
    queueSuccessfulRead(['st']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('st', { routineType: 'ST' }),
      errors: [],
    }));

    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    expect(await screen.findByText('ST:RoutineA@st')).toBeInTheDocument();

    clearViewerCache();
    clearAllTabStates();
    queueSuccessfulRead(['sfc']);
    parseStringMock.mockImplementation(() => ({
      success: true,
      data: makeController('sfc', { routineType: 'SFC' }),
      errors: [],
    }));

    const secondView = render(<L5XViewer filePath="/repo/Programs/Other.L5X" />);
    await screen.findByText('No Content Selected');
    const openButtons = screen.getAllByRole('button', { name: 'Open Routine' });
    fireEvent.click(openButtons[openButtons.length - 1]);
    expect(await screen.findByText('SFC Visualization Not Supported')).toBeInTheDocument();
    secondView.unmount();
  });
});
