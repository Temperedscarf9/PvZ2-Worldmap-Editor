/**
 * HistoryManager — undo / redo for map data mutations.
 *
 * Snapshot strategy: before each user edit we capture m_mapPieces + m_eventList.
 * Undo restores that snapshot and re-renders; redo reapplies the discarded state.
 */

import { State } from '../core/state';
import { triggerMapRender } from './renderTrigger';
import { clearSelection } from './Selection';
import { showToast } from '../ui/toast';

export type HistoryEntry = {
  label: string;
  /** JSON of { m_mapPieces, m_eventList } */
  data: string;
};

const MAX_STACK = 50;

let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let recordingEnabled = true;
/** Debounce: one drag = one history entry */
let openGestureLabel: string | null = null;

function snapshot(): HistoryEntry | null {
  if (!State.data.mapConfig?.objdata) return null;
  const od = State.data.mapConfig.objdata;
  return {
    label: '',
    data: JSON.stringify({
      m_mapPieces: od.m_mapPieces ?? [],
      m_eventList: od.m_eventList ?? [],
    }),
  };
}

function applySnapshot(entry: HistoryEntry): void {
  if (!State.data.mapConfig?.objdata) return;
  try {
    const parsed = JSON.parse(entry.data) as {
      m_mapPieces: unknown[];
      m_eventList: unknown[];
    };
    State.data.mapConfig.objdata.m_mapPieces = parsed.m_mapPieces as any;
    State.data.mapConfig.objdata.m_eventList = parsed.m_eventList as any;
  } catch (err) {
    console.error('[HistoryManager] apply failed', err);
  }
}

function setUndoEnabled(btn: HTMLButtonElement | null, enabled: boolean, title: string): void {
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = title;
}

function updateButtons(): void {
  const canU = undoStack.length > 0;
  const canR = redoStack.length > 0;
  const uTitle = canU
    ? `撤销: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
    : '无可撤销操作 (Ctrl+Z)';
  const rTitle = canR
    ? `重做: ${redoStack[redoStack.length - 1].label} (Ctrl+Y)`
    : '无可重做操作 (Ctrl+Y)';

  for (const id of ['btn-undo', 'btn-undo-side']) {
    setUndoEnabled(document.getElementById(id) as HTMLButtonElement | null, canU, uTitle);
  }
  for (const id of ['btn-redo', 'btn-redo-side']) {
    setUndoEnabled(document.getElementById(id) as HTMLButtonElement | null, canR, rTitle);
  }

  const hint = document.getElementById('history-hint');
  if (hint) {
    if (!canU && !canR) hint.textContent = '尚无编辑历史';
    else hint.textContent = `可撤销 ${undoStack.length} · 可重做 ${redoStack.length}`;
  }
}

export const HistoryManager = {
  clear(): void {
    undoStack = [];
    redoStack = [];
    openGestureLabel = null;
    updateButtons();
  },

  /**
   * Record current map data as a restore point *before* mutating.
   * Call once at the start of an edit (add / delete / flip / drag begin / property save).
   */
  recordBefore(label: string): void {
    if (!recordingEnabled) return;
    if (openGestureLabel === label) return; // same gesture already captured
    const entry = snapshot();
    if (!entry) return;
    entry.label = label;
    undoStack.push(entry);
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack = [];
    openGestureLabel = label;
    updateButtons();
  },

  /** End a multi-step gesture (e.g. mouseup after drag) so the next edit can record again. */
  endGesture(): void {
    openGestureLabel = null;
  },

  /** Drop the latest undo entry if the gesture produced no real change (e.g. click without drag). */
  discardLast(label?: string): void {
    if (!undoStack.length) return;
    const last = undoStack[undoStack.length - 1];
    if (label && last.label !== label) return;
    undoStack.pop();
    updateButtons();
  },

  canUndo(): boolean {
    return undoStack.length > 0;
  },

  canRedo(): boolean {
    return redoStack.length > 0;
  },

  async undo(): Promise<void> {
    if (!undoStack.length || !State.data.mapConfig) {
      showToast('没有可撤销的操作');
      return;
    }
    const current = snapshot();
    const prev = undoStack.pop()!;
    if (current) {
      current.label = prev.label;
      redoStack.push(current);
    }
    recordingEnabled = false;
    try {
      applySnapshot(prev);
      clearSelection();
      await triggerMapRender();
      showToast(`已撤销：${prev.label}`);
    } finally {
      recordingEnabled = true;
      openGestureLabel = null;
      updateButtons();
    }
  },

  async redo(): Promise<void> {
    if (!redoStack.length || !State.data.mapConfig) {
      showToast('没有可重做的操作');
      return;
    }
    const current = snapshot();
    const next = redoStack.pop()!;
    if (current) {
      current.label = next.label;
      undoStack.push(current);
    }
    recordingEnabled = false;
    try {
      applySnapshot(next);
      clearSelection();
      await triggerMapRender();
      showToast(`已重做：${next.label}`);
    } finally {
      recordingEnabled = true;
      openGestureLabel = null;
      updateButtons();
    }
  },

  refreshUI: updateButtons,
};
