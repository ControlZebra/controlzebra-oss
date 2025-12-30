/**
 * TerminalPanel - xterm.js based terminal emulator.
 * Connects to Go backend PTY for full shell access.
 */
import { memo, useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Events } from '@wailsio/runtime';
import { CreateSession, WriteInput, ResizeTerminal, CloseSession } from '../../../../bindings/changeme/services/terminalservice';
import { useRepo } from '../../../context';

function TerminalPanel() {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const sessionIdRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const { repoPath } = useRepo();

  // Initialize terminal session
  const initTerminal = useCallback(async () => {
    if (!terminalRef.current || xtermRef.current) return;

    // Create xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a2e',
        foreground: '#e4e4e4',
        cursor: '#e4e4e4',
        cursorAccent: '#1a1a2e',
        selection: 'rgba(255, 255, 255, 0.3)',
        black: '#1a1a2e',
        red: '#ff6b6b',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e4',
        brightBlack: '#4a4a5e',
        brightRed: '#ff8a8a',
        brightGreen: '#6ee7a0',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#ffffff',
      },
      allowTransparency: true,
      scrollback: 5000,
    });

    // Add fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Add web links addon
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    // Open terminal in container
    term.open(terminalRef.current);
    xtermRef.current = term;

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 0);

    // Create PTY session with working directory
    const workingDir = repoPath || '';
    const result = await CreateSession(workingDir);

    if (!result.success) {
      setError(result.error || 'Failed to create terminal session');
      term.writeln('\x1b[31mError: ' + (result.error || 'Failed to create terminal session') + '\x1b[0m');
      return;
    }

    sessionIdRef.current = result.sessionId;
    setIsConnected(true);

    // Send initial resize
    const { cols, rows } = term;
    await ResizeTerminal(result.sessionId, cols, rows);

    // Handle input from terminal
    term.onData((data) => {
      if (sessionIdRef.current) {
        WriteInput(sessionIdRef.current, data);
      }
    });

    // Handle resize
    term.onResize(({ cols, rows }) => {
      if (sessionIdRef.current) {
        ResizeTerminal(sessionIdRef.current, cols, rows);
      }
    });

    // Listen for output from backend
    const outputCancel = Events.On('terminal-output:' + result.sessionId, (event) => {
      if (xtermRef.current && event.data) {
        xtermRef.current.write(event.data);
      }
    });

    // Listen for errors
    const errorCancel = Events.On('terminal-error:' + result.sessionId, (event) => {
      if (xtermRef.current && event.data) {
        xtermRef.current.writeln('\x1b[31mError: ' + event.data + '\x1b[0m');
      }
    });

    // Listen for exit
    const exitCancel = Events.On('terminal-exit:' + result.sessionId, () => {
      if (xtermRef.current) {
        xtermRef.current.writeln('\x1b[33mTerminal session ended\x1b[0m');
      }
      setIsConnected(false);
    });

    // Store cancellation functions for cleanup
    xtermRef.current._eventCancels = [outputCancel, errorCancel, exitCancel];
  }, [repoPath]);

  // Cleanup on unmount
  useEffect(() => {
    initTerminal();

    return () => {
      // Cancel event listeners
      if (xtermRef.current?._eventCancels) {
        xtermRef.current._eventCancels.forEach(cancel => cancel?.());
      }

      // Close session
      if (sessionIdRef.current) {
        CloseSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }

      // Dispose terminal
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      fitAddonRef.current = null;
      setIsConnected(false);
    };
  }, [initTerminal]);

  // Handle resize when panel size changes
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {
          // Ignore resize errors during disposal
        }
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e]">
      {error && !isConnected && (
        <div className="px-3 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}
      <div 
        ref={terminalRef} 
        className="flex-1 px-2 py-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

export default memo(TerminalPanel);
