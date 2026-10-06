import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllTabStates } from './l5x/useTabs';
import { clearViewerCache, getCachedContent } from '../../registry/viewer-cache';
import L5XViewer from './L5XViewer';
import L5XFileViewer from './L5XFileViewer';

const {
  readTextFileMock,
  controllerResultMock,
  onEventMock,
  registerAOIsFromControllerMock,
  clearAOIsMock,
  fbdDiagramMock,
  tagTableMock,
  testState,
} = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
  controllerResultMock: vi.fn(),
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
  ViewerHeader: ({ filePath, extraContent }: { filePath: string; extraContent?: React.ReactNode }) => <div data-testid="viewer-header">{filePath}{extraContent}</div>,
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
    parseDocumentString: (content: string, format: string) => {
      const result = controllerResultMock(content, format);
      return {
        ...result,
        data: result.data && {
          source: { format: 'l5x', targetType: 'Controller', targetName: result.data.name },
          resources: [{ kind: 'controller', id: '/Controller[1]', sourcePath: '/Controller[1]', role: 'target', data: result.data }],
          targetIds: ['/Controller[1]'], encodedData: [], fragments: [], mappings: [],
        },
      };
    },
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

    controllerResultMock.mockImplementation((content: string) => ({
      success: true,
      data: makeController(content),
      errors: [],
    }));
  });

  function metadataController(version: string) {
    const base = makeController(version, { includeDataTypes: true, includeAOIFBD: true });
    return { ...base,
      programs: [{ ...base.programs[0], uid: '18446744073709551615', description: `Description ${version}`,
        mainRoutineName: 'RoutineA', executingTaskName: 'Cycle', parameters: [], localTags: [] }],
      tasks: [{ name: 'Cycle', type: 'Periodic', rate: 0, scheduledProgramNames: ['MainProgram'] }],
      modules: [{ name: 'Rack', id: 0, ports: [], connections: [], inhibited: false, majorFault: false, safetyEnabled: false }],
    };
  }

  it('opens all six metadata families from the organizer without duplicate tabs', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: 'v1' });
    controllerResultMock.mockReturnValue({ success: true, data: metadataController('v1') });
    await renderLoadedViewer();
    const labels = ['Controller: Controller v1', 'Program: MainProgram', 'Task: Cycle', 'AOI: MixerAOI',
      'Data type: PumpState', 'Module: Rack'];
    for (const label of labels) {
      fireEvent.click(screen.getByRole('button', { name: `Inspect ${label}` }));
      expect(screen.getByRole('button', { name: `Inspect ${label}` })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByRole('heading', { level: 2 }).some(heading => heading.textContent?.includes('Metadata'))).toBe(true);
    }
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: MainProgram' }));
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    const taskTab = screen.getByRole('tab', { name: /Task: Cycle Metadata/ });
    taskTab.focus();
    fireEvent.keyDown(taskTab, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Cycle Metadata' })).toBeVisible();
  });

  it('keeps metadata, routine links and selection attached to their owner after reordering and removal', async () => {
    queueSuccessfulRead(['v1', 'v2', 'v3']);
    controllerResultMock.mockImplementation((version: string) => {
      const data = metadataController(version);
      if (version !== 'v1') {
        data.programs.unshift({ ...data.programs[0], uid: '1', name: 'Other',
          routines: [makeRoutine('OtherRoutine', 'RLL', version)] });
        if (version === 'v3') data.programs.pop();
      }
      return { success: true, data };
    });
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: MainProgram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Main routine: RoutineA' }));
    expect(screen.getByText('RLL:RoutineA@v1')).toBeVisible();
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('RLL:RoutineA@v2')).toBeVisible();
    expect(screen.getByTestId('selected-routine')).toHaveTextContent('1:0');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: MainProgram' }));
    expect(screen.getByText('Description v2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Main routine: RoutineA' }));
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('Routine not found')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /Program: MainProgram Metadata/ }));
    expect(screen.getByText(/This entity is no longer in the file/)).toBeVisible();
  });

  it('opens existing AOI, datatype and module views from metadata links', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: 'v1' });
    controllerResultMock.mockReturnValue({ success: true, data: metadataController('v1') });
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect AOI: MixerAOI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Parameters: 0' }));
    expect(screen.getByText('AOI Parameters')).toBeVisible();
    expect(screen.getByRole('tab', { name: /MixerAOI Parameters/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Data type: PumpState' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Member structure: 1' }));
    expect(screen.getByRole('heading', { name: 'PumpState' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Module: Rack' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Module configuration: Rack' }));
    expect(screen.getByText('Module Info')).toBeVisible();
  });

  it('retains program-tag ownership and deduplication after UID-preserving rename and name reuse', async () => {
    queueSuccessfulRead(['v1', 'v2', 'v3']);
    controllerResultMock.mockImplementation((version: string) => {
      const data = metadataController(version);
      data.programs[0].tags = [{ name: 'OriginalTag', dataType: 'BOOL' }];
      if (version !== 'v1') {
        data.programs[0].name = 'Renamed';
        data.programs.unshift({ ...data.programs[0], name: 'MainProgram', uid: '1',
          tags: [{ name: 'ReplacementTag', dataType: 'BOOL' }] });
      }
      if (version === 'v3') data.programs.pop();
      return { success: true, data };
    });
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: MainProgram' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Program tags: 1' }));
    expect(tagTableMock).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [{ name: 'OriginalTag', dataType: 'BOOL' }] }), expect.anything());
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inspect Program: Renamed' })).toBeInTheDocument());
    expect(tagTableMock).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [{ name: 'OriginalTag', dataType: 'BOOL' }] }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: Renamed' }));
    expect(screen.getByRole('tab', { name: /Program: Renamed Metadata/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open Program tags: 1' }));
    expect(screen.getByRole('tab', { name: /Renamed Tags/ })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText(/This program is no longer in the file/)).toBeVisible();
    expect(screen.queryByText('No program-specific tags defined')).not.toBeInTheDocument();
  });

  it('keeps duplicate-UID inspectors and linked views on the selected program through reorder and removal', async () => {
    queueSuccessfulRead(['v1', 'v2', 'v3']);
    controllerResultMock.mockImplementation((version: string) => {
      const data = metadataController(version);
      const programs = ['DuplicateA', 'DuplicateB'].map(name => ({ ...data.programs[0], name, uid: '10',
        tags: [{ name: `${name}Tag`, dataType: 'BOOL' }], routines: [makeRoutine('RoutineA', 'RLL', `${name}-${version}`)] }));
      data.programs = version === 'v1' ? programs.reverse() : version === 'v3' ? programs.slice(0, 1) : programs;
      return { success: true, status: 'partial', data };
    });
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Program Tags' }));
    expect(tagTableMock).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [{ name: 'DuplicateBTag', dataType: 'BOOL' }] }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    expect(screen.getByText('RLL:RoutineA@DuplicateB-v1')).toBeVisible();
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('RLL:RoutineA@DuplicateB-v2')).toBeVisible();
    expect(screen.getByTestId('selected-routine')).toHaveTextContent('1:0');
    for (const name of ['DuplicateA', 'DuplicateB']) {
      fireEvent.click(screen.getByRole('button', { name: `Inspect Program: ${name}` }));
      expect(screen.getByRole('heading', { name: `${name} Metadata` })).toBeVisible();
      fireEvent.click(within(screen.getByRole('region', { name: `${name} Metadata` })).getByRole('button', { name: 'Open Main routine: RoutineA' }));
      expect(screen.getByText(`RLL:RoutineA@${name}-v2`)).toBeVisible();
    }
    expect(screen.getAllByRole('tab', { name: /RoutineA/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: DuplicateB' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'DuplicateB Metadata' })).getByRole('button', { name: 'Open Program tags: 1' }));
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(tagTableMock).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [{ name: 'DuplicateBTag', dataType: 'BOOL' }] }), expect.anything());
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText(/This program is no longer in the file/)).toBeVisible();
    fireEvent.click(screen.getAllByRole('tab', { name: /RoutineA/ })[0]);
    expect(screen.getByText('Routine not found')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: /Program: DuplicateB Metadata/ }));
    expect(screen.getByText(/This entity is no longer in the file/)).toBeVisible();
  });

  it.each(['Enter', ' '])('does not cancel native close-button activation with %s', async key => {
    readTextFileMock.mockResolvedValue({ success: true, content: 'v1' });
    controllerResultMock.mockReturnValue({ success: true, data: metadataController('v1') });
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Program: MainProgram' }));
    const tab = screen.getByRole('tab', { name: /Program: MainProgram Metadata/ });
    const close = within(tab).getByRole('button', { name: 'Close tab' });
    close.focus();
    expect(fireEvent.keyDown(close, { key })).toBe(true);
    fireEvent.click(close);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('bounds a large organizer inventory and finds an entity beyond the first page', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: 'v1' });
    const data = metadataController('v1');
    data.tasks = Array.from({ length: 70 }, (_, index) => ({ name: `Task${index}`, type: 'Periodic', rate: index, scheduledProgramNames: [] }));
    controllerResultMock.mockReturnValue({ success: true, data });
    await renderLoadedViewer();
    const nav = screen.getByRole('navigation', { name: 'Entity metadata' });
    expect(within(nav).getAllByRole('button')).toHaveLength(25);
    fireEvent.change(screen.getByRole('textbox', { name: 'Find metadata entity' }), { target: { value: 'Task69' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Task: Task69' }));
    expect(screen.getByRole('heading', { name: 'Task69 Metadata' })).toBeVisible();
  });

  it('switches to raw text without mixing parsed caches and preserves structured selection', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: '<Controller />' });
    const view = render(<L5XFileViewer filePath="/repo/Programs/Main.L5X" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Routine' }));
    expect(await screen.findByText('RLL:RoutineA@<Controller />')).toBeVisible();
    expect(screen.getAllByTestId('viewer-header')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(await screen.findByText('<Controller />')).toBeVisible();
    expect(screen.getByText('RLL:RoutineA@<Controller />')).not.toBeVisible();
    expect(getCachedContent('/repo/Programs/Main.L5X')).toBe('<Controller />');
    expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({ controller: { name: 'Controller <Controller />' } });

    fireEvent.click(screen.getByRole('button', { name: 'Pretty' }));
    expect(screen.getByText('RLL:RoutineA@<Controller />')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    view.unmount();
    render(<L5XFileViewer filePath="/repo/Programs/Main.L5X" />);
    expect(screen.getByRole('button', { name: 'Pretty' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers source inspection after parsing fails and refreshes raw text', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: '<broken>' });
    controllerResultMock.mockReturnValue({ success: false, errors: [{ message: 'Invalid XML' }] });
    render(<L5XFileViewer filePath="/repo/Programs/Main.L5X" />);
    await screen.findByText('Cannot parse L5X file');
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(await screen.findByText('<broken>')).toBeVisible();
    readTextFileMock.mockResolvedValue({ success: true, content: '<updated>' });
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('<updated>')).toBeVisible();
  });

  it('reads and parses the file once on initial render', async () => {
    queueSuccessfulRead(['v1']);

    await renderLoadedViewer();

    expect(readTextFileMock).toHaveBeenCalledTimes(1);
    expect(readTextFileMock).toHaveBeenCalledWith('/repo/Programs/Main.L5X');
    expect(controllerResultMock).toHaveBeenCalledTimes(1);
    expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({
      controller: { name: 'Controller v1' },
    });
  });

  it('keeps partial content usable and shows source locations with a working Raw action', async () => {
    readTextFileMock.mockResolvedValue({ success: true, content: 'partial source' });
    controllerResultMock.mockReturnValue({ success: true, status: 'partial', data: makeController('partial'),
      warnings: [{ message: 'Unsupported declaration dimensions.', location: { line: 12, column: 4, path: '/Controller[1]/Tags[1]' } }] });
    render(<L5XFileViewer filePath="/repo/Programs/Main.L5X" />);
    await screen.findByText('Some content is available only in Raw');
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    expect(await screen.findByText('RLL:RoutineA@partial')).toBeVisible();
    fireEvent.click(screen.getByText('1 parser notice'));
    expect(screen.getByText('Line 12, column 4, /Controller[1]/Tags[1]')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View Raw' }));
    expect(await screen.findByText('partial source')).toBeVisible();
    expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({ status: 'partial', warnings: [{ location: { line: 12 } }] });
  });

  it.each(['success', 'error'])('ignores a stale %s from an earlier reload of the same file', async outcome => {
    queueSuccessfulRead(['v1']);
    await renderLoadedViewer();
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    let resolveRead!: (result: { success: boolean; content: string }) => void;
    let rejectRead!: (error: Error) => void;
    readTextFileMock.mockImplementationOnce(() => new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }))
      .mockResolvedValueOnce({ success: true, content: 'v3' });
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    await waitFor(() => expect(readTextFileMock).toHaveBeenCalledTimes(2));
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');
    expect(await screen.findByText('RLL:RoutineA@v3')).toBeVisible();
    await act(async () => {
      if (outcome === 'success') resolveRead({ success: true, content: 'v2' });
      else rejectRead(new Error('stale read failure'));
    });
    expect(screen.getByText('RLL:RoutineA@v3')).toBeVisible();
    expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({ controller: { name: 'Controller v3' } });
    expect(screen.queryByText('stale read failure')).not.toBeInTheDocument();
  });

  it('ignores files-changed events for other files', async () => {
    queueSuccessfulRead(['v1']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Other.L5X', 'write');

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(1);
      expect(controllerResultMock).toHaveBeenCalledTimes(1);
    });
  });

  it('reloads after a matching write event and replaces the cached controller', async () => {
    queueSuccessfulRead(['v1', 'v2']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Main.L5X', 'write');

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(2);
      expect(controllerResultMock).toHaveBeenCalledTimes(2);
      expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({
        controller: { name: 'Controller v2' },
      });
    });
  });

  it.each(['rename', 'remove'])('reloads after a matching %s event', async (eventType) => {
    queueSuccessfulRead(['v1', 'v2']);

    await renderLoadedViewer();
    await emitFilesChanged('/repo/Programs/Main.L5X', eventType);

    await waitFor(() => {
      expect(readTextFileMock).toHaveBeenCalledTimes(2);
      expect(controllerResultMock).toHaveBeenCalledTimes(2);
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
    controllerResultMock.mockImplementation(() => ({
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
    controllerResultMock.mockReturnValue({ success: true, data: controller, errors: [] });

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
    controllerResultMock
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
    controllerResultMock.mockImplementation(() => ({
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
      theme: { bgPrimary: 'var(--lv-bg-primary)' },
      sheetIndex: 0,
    });
    expect(props.onDiagnostics).toEqual(expect.any(Function));
    expect(screen.getAllByRole('button', { name: 'Zoom in' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Zoom out' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Fit view' })).toHaveLength(1);
  });

  it('renders an AOI-owned FBD through the same viewer configuration', async () => {
    queueSuccessfulRead(['v1']);
    controllerResultMock.mockImplementation(() => ({
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
    controllerResultMock.mockImplementation(() => ({
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
    expect(controllerResultMock).toHaveBeenCalledTimes(1);
  });

  it('preserves FBD sheet state across app-tab switches and file refreshes', async () => {
    queueSuccessfulRead(['v1', 'v2']);
    controllerResultMock.mockImplementation((content: string) => ({
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
    expect(getCachedContent('l5x:/repo/Programs/Main.L5X')).toMatchObject({
      controller: { name: 'Controller v2' },
    });
  });

  it('preserves FBD navigation while the CSS palette changes with the app theme', async () => {
    queueSuccessfulRead(['v1']);
    controllerResultMock.mockImplementation(() => ({
      success: true,
      data: makeController('v1', { routineType: 'FBD' }),
      errors: [],
    }));

    render(<L5XViewer filePath="/repo/Programs/Main.L5X" />);
    await screen.findByText('No Content Selected');
    fireEvent.click(screen.getByRole('button', { name: 'Open Routine' }));
    await screen.findByText('FBD:v1:sheet-0');
    expect(latestFBDDiagramProps().theme).toMatchObject({
      bgPrimary: 'var(--lv-bg-primary)',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next FBD sheet' }));
    expect(screen.getByText('FBD:v1:sheet-1')).toBeInTheDocument();

    act(() => {
      testState.theme = 'dark';
      testState.themeListeners.forEach((listener) => listener());
    });

    await waitFor(() => {
      expect(latestFBDDiagramProps().theme).toMatchObject({
        bgPrimary: 'var(--lv-bg-primary)',
      });
      expect(screen.getByText('FBD:v1:sheet-1')).toBeInTheDocument();
    });
  });

  it('surfaces fatal FBD online-edit rejection through the existing parse error path', async () => {
    queueSuccessfulRead(['online-edit']);
    controllerResultMock.mockReturnValue({
      success: false,
      errors: [{ message: 'Unsupported FBD online-edit representation.' }],
    });

    render(<L5XViewer filePath="/repo/Programs/Main.L5X" />);

    expect(await screen.findByText('Cannot parse L5X file')).toBeInTheDocument();
    expect(screen.getByText(/Unsupported FBD online-edit representation\./)).toBeInTheDocument();
    expect(fbdDiagramMock).not.toHaveBeenCalled();
  });

  it('keeps ST rendering and unsupported routine messaging unchanged', async () => {
    queueSuccessfulRead(['st']);
    controllerResultMock.mockImplementation(() => ({
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
    controllerResultMock.mockImplementation(() => ({
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
