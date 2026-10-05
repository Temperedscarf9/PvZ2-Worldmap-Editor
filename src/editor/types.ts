import type { PieceInfo, EventPieceInfo, MapEventNode } from '../domain/types';

/** Unified selection handle for map pieces and event nodes. */
export type SelectedRef = PieceInfo | EventPieceInfo;

export type ToolMode = 'island' | 'doodad' | 'event' | 'select';

/** Sub-tool for island / doodad drawing modes (shared UI row). */
export type DrawSubMode = 'add' | 'move' | 'flip' | 'rotation' | 'delete' | 'none';

export type EventSubMode = 'add' | 'move' | 'edit' | 'delete' | 'none';

export function getSelectedNode(ref: SelectedRef | null): MapEventNode | null {
  if (!ref) return null;
  if ('piece' in ref && ref.piece) return ref.piece;
  if ('node' in ref && ref.node) return ref.node;
  return null;
}

export function isMapPieceRef(ref: SelectedRef): ref is PieceInfo {
  return 'piece' in ref && !!(ref as PieceInfo).piece;
}

export function isEventPieceRef(ref: SelectedRef): ref is EventPieceInfo {
  return 'node' in ref && !!(ref as EventPieceInfo).node;
}

export function isDoodadRef(ref: SelectedRef): boolean {
  return isEventPieceRef(ref) && ref.node.m_eventType === 'doodad';
}

export function isEventNodeRef(ref: SelectedRef): boolean {
  return isEventPieceRef(ref) && ref.node.m_eventType !== 'doodad';
}
