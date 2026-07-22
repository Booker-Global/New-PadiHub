/**
 * DiagnosticErrorOverlay
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY diagnostic instrumentation — remove once the mobile bug is found.
 *
 * Catches three categories of errors and displays them as a visible red banner
 * at the top of the screen so they surface on mobile without needing DevTools:
 *
 *   1. React render errors  — via componentDidCatch (ErrorBoundary)
 *   2. Unhandled JS errors  — via window.onerror
 *   3. Unhandled rejections — via window.unhandledrejection
 *
 * Usage: wrap your app tree with <DiagnosticErrorOverlay> in main.tsx.
 * The overlay itself never crashes — if the banner can't render it fails silently.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiagEntry {
  id: number;
  kind: 'render' | 'runtime' | 'promise';
  message: string;
  source?: string;   // file + line, or component stack excerpt
  ts: string;        // HH:MM:SS
}

interface State {
  entries: DiagEntry[];
  renderError: DiagEntry | null;
  minimised: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = 0;
const nextId = () => ++_counter;

function now(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

/** Trim a component stack to the first 3 lines so it fits on screen. */
function trimStack(stack: string | undefined | null): string {
  if (!stack) return '';
  return stack
    .split('\n')
    .filter(Boolean)
    .slice(0, 4)
    .join(' › ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Singleton event bus so window handlers can push into React state ─────────

type Listener = (entry: DiagEntry) => void;
const listeners: Listener[] = [];

function pushEntry(entry: DiagEntry) {
  listeners.forEach((fn) => fn(entry));
}

// ─── Banner UI (pure function, no hooks — safe inside class render) ───────────

const BANNER_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 2147483647,
  background: '#1a0000',
  borderBottom: '2px solid #ff3333',
  fontFamily: 'monospace',
  fontSize: 13,
  color: '#ff9999',
  maxHeight: '60vh',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  background: '#ff3333',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  letterSpacing: 0.5,
  cursor: 'pointer',
  userSelect: 'none',
};

const ENTRY_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #330000',
};

const KIND_LABEL: Record<DiagEntry['kind'], string> = {
  render: '⚛ RENDER',
  runtime: '⚡ RUNTIME',
  promise: '🔴 PROMISE',
};

function Banner({
  entries,
  minimised,
  onToggle,
  onDismiss,
  onClear,
}: {
  entries: DiagEntry[];
  minimised: boolean;
  onToggle: () => void;
  onDismiss: (id: number) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div style={BANNER_STYLE} role="alert" aria-live="assertive">
      <div style={HEADER_STYLE} onClick={onToggle}>
        <span>🐛 DIAG — {entries.length} error{entries.length !== 1 ? 's' : ''} {minimised ? '▼' : '▲'}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}
        >
          Clear all
        </button>
      </div>

      {!minimised && entries.map((e) => (
        <div key={e.id} style={ENTRY_STYLE}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: '#ff6666', fontWeight: 700 }}>
              {KIND_LABEL[e.kind]} <span style={{ color: '#888', fontWeight: 400 }}>{e.ts}</span>
            </span>
            <button
              onClick={() => onDismiss(e.id)}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div style={{ color: '#ffcccc', wordBreak: 'break-word', marginBottom: e.source ? 4 : 0 }}>
            {e.message}
          </div>
          {e.source && (
            <div style={{ color: '#888', fontSize: 11, wordBreak: 'break-word' }}>
              {e.source}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
}

export default class DiagnosticErrorOverlay extends Component<Props, State> {
  state: State = {
    entries: [],
    renderError: null,
    minimised: false,
  };

  private _unsubscribe: (() => void) | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  componentDidMount() {
    // Register this instance as a listener for window-level errors
    const listener: Listener = (entry) => {
      this.setState((s) => ({ entries: [entry, ...s.entries].slice(0, 20) }));
    };
    listeners.push(listener);
    this._unsubscribe = () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };

    // window.onerror — catches synchronous runtime errors
    const prevOnerror = window.onerror;
    window.onerror = (msg, src, line, col, err) => {
      const message = err?.message ?? String(msg);
      const source = src ? `${src}:${line}:${col}` : undefined;
      pushEntry({ id: nextId(), kind: 'runtime', message, source, ts: now() });
      if (typeof prevOnerror === 'function') prevOnerror(msg, src, line, col, err);
      return false; // don't suppress default handling
    };

    // unhandledrejection — catches async errors / rejected promises
    const onUnhandled = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason);
      pushEntry({ id: nextId(), kind: 'promise', message, ts: now() });
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    // Store cleanup refs
    (this as any)._prevOnerror = prevOnerror;
    (this as any)._onUnhandled = onUnhandled;
  }

  componentWillUnmount() {
    this._unsubscribe?.();
    window.onerror = (this as any)._prevOnerror ?? null;
    window.removeEventListener('unhandledrejection', (this as any)._onUnhandled);
  }

  // ── React render error boundary ────────────────────────────────────────────

  static getDerivedStateFromError(error: Error): Partial<State> {
    const entry: DiagEntry = {
      id: nextId(),
      kind: 'render',
      message: error.message,
      ts: now(),
    };
    return { renderError: entry };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const source = trimStack(info.componentStack);
    const entry: DiagEntry = {
      id: nextId(),
      kind: 'render',
      message: error.message,
      source,
      ts: now(),
    };
    this.setState((s) => ({
      entries: [entry, ...s.entries].slice(0, 20),
      renderError: entry,
    }));
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private dismiss = (id: number) => {
    this.setState((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
      renderError: s.renderError?.id === id ? null : s.renderError,
    }));
  };

  private clear = () => {
    this.setState({ entries: [], renderError: null });
  };

  private toggle = () => {
    this.setState((s) => ({ minimised: !s.minimised }));
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const { entries, renderError, minimised } = this.state;

    // If a render error crashed the tree, show a minimal fallback + the banner
    const content = renderError ? (
      <div style={{ padding: '80px 24px 24px', fontFamily: 'sans-serif', color: '#333' }}>
        <h2 style={{ color: '#cc0000' }}>Render error — see diagnostic banner above</h2>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, overflowX: 'auto', fontSize: 12 }}>
          {renderError.message}
          {renderError.source ? `\n\nComponent stack:\n${renderError.source}` : ''}
        </pre>
      </div>
    ) : (
      this.props.children
    );

    return (
      <>
        <Banner
          entries={entries}
          minimised={minimised}
          onToggle={this.toggle}
          onDismiss={this.dismiss}
          onClear={this.clear}
        />
        {content}
      </>
    );
  }
}
