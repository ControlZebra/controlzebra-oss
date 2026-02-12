/**
 * DebugView - Main sidebar view for the debug logging system.
 *
 * Features:
 * - Enable/disable toggle in the header
 * - Real-time log streaming via "debug:new-log" Wails events
 * - Search + category filter bar
 * - Scrollable log list with auto-scroll-to-bottom behavior
 * - Stats footer with export & clear actions
 *
 * Data flow:
 *   1. On mount, fetch initial enabled state + stats from DebugService
 *   2. Listen for "debug:new-log" and "debug:state-changed" events
 *   3. Append new entries to local state; batch re-fetch stats periodically
 *   4. Filtering/search is applied client-side for instant feedback;
 *      falls back to backend GetLogs for paginated results if buffer is large
 */
import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowDown } from 'lucide-react';
import { Events } from '@wailsio/runtime';
import { toast } from 'sonner';
import {
  IsEnabled,
  SetEnabled,
  GetLogs,
  ClearLogs,
  ExportLogs,
  GetStats,
} from '../../../../bindings/controlzebra/services/debugservice';
import type {
  LogEntry,
  DebugStats,
} from '../../../../bindings/controlzebra/services/models';
import { LogFilter } from '../../../../bindings/controlzebra/services/models';
import DebugToggle from './debug/DebugToggle';
import LogFilterBar from './debug/LogFilterBar';
import LogEntryRow from './debug/LogEntryRow';
import StatsBar from './debug/StatsBar';

// ============================================================================
// Constants
// ============================================================================

/** Maximum entries kept in local state to cap memory. */
const MAX_LOCAL_ENTRIES = 2000;
/** How often to refresh stats from the backend (ms). */
const STATS_REFRESH_MS = 3000;

// ============================================================================
// Component
// ============================================================================

function DebugView(): JSX.Element {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<DebugStats>({
    enabled: false,
    totalEntries: 0,
    totalCommands: 0,
    totalMethods: 0,
    totalErrors: 0,
    bufferUsage: 0,
  } as DebugStats);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Ref for the scrollable log container
  const listRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Initial data fetch
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [isOn, initialStats] = await Promise.all([IsEnabled(), GetStats()]);
        if (cancelled) return;
        setEnabled(isOn);
        setStats(initialStats);

        // If already enabled, pull existing logs
        if (isOn) {
          const logs = await GetLogs(new LogFilter({ limit: MAX_LOCAL_ENTRIES }));
          if (!cancelled) setEntries(logs);
        }
      } catch {
        // Service may not be available yet during startup
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // ---------------------------------------------------------------------------
  // Real-time event listeners
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // New log entry from backend
    const handleNewLog = (entry: LogEntry) => {
      setEntries((prev) => {
        const next = [...prev, entry];
        // Cap local state to prevent unbounded growth
        if (next.length > MAX_LOCAL_ENTRIES) {
          return next.slice(next.length - MAX_LOCAL_ENTRIES);
        }
        return next;
      });
    };

    // Logging state changed (enabled/disabled)
    const handleStateChanged = (isEnabled: boolean) => {
      setEnabled(isEnabled);
      if (!isEnabled) {
        // Optionally clear local entries when disabled — or keep them visible.
        // We keep them so user can inspect what happened.
      }
    };

    const unsub1 = Events.On('debug:new-log', (event: any) => {
      // Wails event data is in event.data[0] for registered events
      const data = event?.data?.[0] ?? event;
      handleNewLog(data as LogEntry);
    });
    const unsub2 = Events.On('debug:state-changed', (event: any) => {
      const data = event?.data?.[0] ?? event;
      handleStateChanged(data as boolean);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Periodic stats refresh
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(async () => {
      try {
        const s = await GetStats();
        setStats(s);
      } catch { /* ignore */ }
    }, STATS_REFRESH_MS);

    return () => clearInterval(interval);
  }, [enabled]);

  // ---------------------------------------------------------------------------
  // Auto-scroll to bottom
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Detect when user scrolls up (disabling auto-scroll)
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    // "At the bottom" means within 40px of the bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const jumpToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    setAutoScroll(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleToggle = useCallback(async (value: boolean) => {
    try {
      await SetEnabled(value);
      setEnabled(value);
      // If just enabled, fetch any logs that may have been created
      if (value) {
        const logs = await GetLogs(new LogFilter({ limit: MAX_LOCAL_ENTRIES }));
        setEntries(logs);
        const s = await GetStats();
        setStats(s);
      }
    } catch {
      toast.error('Failed to toggle debug logging');
    }
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const filePath = await ExportLogs();
      if (filePath) {
        toast.success(`Logs exported to ${filePath}`, { duration: 5000 });
      } else {
        toast.error('Export failed — check permissions');
      }
    } catch {
      toast.error('Failed to export logs');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await ClearLogs();
      setEntries([]);
      const s = await GetStats();
      setStats(s);
    } catch {
      toast.error('Failed to clear logs');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Client-side filtering
  // ---------------------------------------------------------------------------
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Category filter
    if (activeCategory) {
      result = result.filter((e) => e.category === activeCategory);
    }

    // Text search (case-insensitive in message + source)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.message && e.message.toLowerCase().includes(q)) ||
          (e.source && e.source.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, activeCategory, search]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="h-full flex flex-col">
      {/* Header: title + toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-theme-default shrink-0">
        <span className="text-xs font-medium text-theme-primary">Debug Logs</span>
        <DebugToggle enabled={enabled} onToggle={handleToggle} />
      </div>

      {/* Filter bar */}
      <LogFilterBar
        search={search}
        onSearchChange={setSearch}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Log list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{ contentVisibility: 'auto' }}
      >
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-theme-muted text-xs gap-2 px-4 text-center">
            {!enabled ? (
              <>
                <p>Debug logging is disabled.</p>
                <p>Enable it above to start capturing CLI commands and service calls.</p>
              </>
            ) : entries.length === 0 ? (
              <p>Waiting for log entries…</p>
            ) : (
              <p>No entries match the current filter.</p>
            )}
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <LogEntryRow key={entry.id} entry={entry} />
          ))
        )}

        {/* "Jump to latest" button when user scrolled up */}
        {!autoScroll && filteredEntries.length > 0 && (
          <button
            onClick={jumpToBottom}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1
                       px-2.5 py-1 rounded-full text-[11px] font-medium
                       bg-blue-600 text-white shadow-lg hover:bg-blue-500 transition-colors z-10"
          >
            <ArrowDown size={12} />
            Jump to latest
          </button>
        )}
      </div>

      {/* Stats footer */}
      <StatsBar
        stats={stats}
        onExport={handleExport}
        onClear={handleClear}
        isExporting={isExporting}
      />
    </div>
  );
}

export default memo(DebugView);
