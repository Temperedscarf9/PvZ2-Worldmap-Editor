/**
 * ObjectMount — thin editor-facing API for single-node mount/unmount/refresh.
 * Create/mount work is owned by scene factories + LayerStack.
 */

import { State, pieceRuntimeMap } from '../core/state';
import { getOrCreatePieceLayerContainer, getOrCreateEventLayerContainer } from '../render/MapRenderer';
import { getSelectedNode, isMapPieceRef } from './types';
import { EditorState } from './EditorState';
import { clearSelection, selectPiece } from './Selection';
import { updateToolbarState } from '../ui/toolbar';
import { IslandFactory } from '../scene/factories/IslandFactory';
import { EventFactory } from '../scene/factories/EventFactory';
import { PathFactory } from '../scene/factories/PathFactory';
import { tryGetLayerStack } from '../scene/LayerStack';
import { invalidateEventResourceCacheForNode } from '../events/resolveEventResources';

/** @deprecated Prefer factories; kept for legacy call sites. */
export function getPieceLayerContainer(node: { m_parallaxLayer?: number; m_drawLayer?: number }): HTMLElement {
  return getOrCreatePieceLayerContainer(node.m_parallaxLayer ?? 0, node.m_drawLayer ?? 0);
}

/** @deprecated Prefer factories. */
export function getEventLayerContainer(node: { m_parallaxLayer?: number; m_drawLayer?: number }): HTMLElement {
  return getOrCreateEventLayerContainer(node.m_parallaxLayer ?? 0, node.m_drawLayer ?? 0);
}

function destroyPlayers(players: { destroy(): void }[] | undefined): void {
  if (!players) return;
  for (const pl of players) {
    pl.destroy();
    const i = State.players.indexOf(pl as any);
    if (i !== -1) State.players.splice(i, 1);
  }
}

export function destroyPieceInfo(pInfo: {
  player?: { destroy(): void };
  element?: HTMLElement;
}): void {
  destroyPlayers(pInfo.player ? [pInfo.player] : undefined);
  pInfo.element?.parentNode?.removeChild(pInfo.element);
}

export function destroyEventPieceInfo(ep: {
  players?: { destroy(): void }[];
  element?: HTMLElement;
}): void {
  destroyPlayers(ep.players);
  ep.element?.parentNode?.removeChild(ep.element);
}

export function applyTransformOnly(node: any): void {
  IslandFactory.applyTransform(node);
  EventFactory.applyTransform(node);
}

/** Unmount every visual bound to this node. */
export function detachNodeFromRender(node: any): void {
  IslandFactory.unmount(node);
  EventFactory.unmount(node);
  EditorState.rotatingPieces = State.data.pieces.filter((p) => p.piece.m_rotationRate);
  pieceRuntimeMap.delete(node);
}

export async function mountMapPiece(node: any): Promise<any | null> {
  const entity = await IslandFactory.mount(node);
  EditorState.rotatingPieces = State.data.pieces.filter((p) => p.piece.m_rotationRate);
  return entity?.info ?? null;
}

export async function mountEventNode(node: any): Promise<any[]> {
  const entities = await EventFactory.mount(node);
  return entities.map((e) => e.info);
}

/** Remount one event/doodad and lightly refresh path geometry. */
export async function mountOrRefreshEventNode(node: any): Promise<any> {
  EventFactory.unmount(node);
  const entities = await EventFactory.mount(node);
  try {
    PathFactory.refreshAfterMove();
  } catch (e) {
    console.warn('[mountOrRefreshEventNode] PathFactory.refreshAfterMove failed', e);
  }
  return EventFactory.pickSelectable(entities);
}

/**
 * Refresh one object after an edit.
 *   transform — CSS only; reload — tear + rebuild; remove — detach.
 */
export async function refreshSingleObject(
  node: any,
  mode: 'transform' | 'reload' | 'remove' = 'reload'
): Promise<void> {
  if (!node) return;

  if (mode === 'remove') {
    detachNodeFromRender(node);
    clearSelection();
    return;
  }

  const isMapPiece =
    (State.data.mapConfig?.objdata?.m_mapPieces || []).includes(node) ||
    State.data.pieces.some((p) => p.piece === node);

  if (mode === 'transform' && isMapPiece) {
    applyTransformOnly(node);
    return;
  }

  const wasSelected =
    !!EditorState.selectedPieceRef && getSelectedNode(EditorState.selectedPieceRef) === node;

  // Drop stale resource lists before rebuild (esp. key_gate flag geometry).
  if (!isMapPiece && node.m_eventId != null) {
    invalidateEventResourceCacheForNode(node.m_eventId);
  }

  detachNodeFromRender(node);
  const reselect = isMapPiece ? await mountMapPiece(node) : await mountOrRefreshEventNode(node);

  if (wasSelected && reselect) selectPiece(reselect);
  else if (wasSelected) clearSelection();
  else updateToolbarState();
}

/**
 * After a node moves: remount any key_gate whose flag layout depends on it
 * (the node itself if it is a key_gate, or key_gates that parent to it).
 * Drag only updates CSS position; flag offsets are baked at resolve time.
 */
export async function refreshKeyGateFlagsAffectedBy(movedNode: any): Promise<void> {
  if (!movedNode) return;
  const list: any[] = State.data.mapConfig?.objdata?.m_eventList || [];
  const targets: any[] = [];
  if (movedNode.m_eventType === 'key_gate') {
    targets.push(movedNode);
  }
  const movedName = movedNode.m_name != null ? String(movedNode.m_name) : '';
  if (movedName) {
    for (const n of list) {
      if (
        n &&
        n.m_eventType === 'key_gate' &&
        n.m_parentEvent != null &&
        String(n.m_parentEvent) === movedName &&
        n !== movedNode
      ) {
        targets.push(n);
      }
    }
  }
  for (const n of targets) {
    await refreshSingleObject(n, 'reload');
  }
}

/** Newly added object: mount only. */
export async function mountNewObject(node: any, kind: 'piece' | 'event' | 'doodad'): Promise<void> {
  const reselect = kind === 'piece' ? await mountMapPiece(node) : await mountOrRefreshEventNode(node);
  if (reselect) selectPiece(reselect);
}

/**
 * CurLayer filter (mapPieces only).
 */
export function applyDrawLayerFilter(): void {
  const cur = EditorState.defaultDrawLayer;
  const filterOn = EditorState.isCurLayerActive;

  State.data.pieces.forEach((p) => {
    const el = p.element;
    if (!el) return;
    el.classList.remove('layer-above-hidden', 'layer-match', 'layer-mismatch');
    if (!filterOn) return;
    const layer = p.piece?.m_drawLayer ?? 0;
    if (layer > cur) el.classList.add('layer-above-hidden', 'layer-mismatch');
    else if (layer === cur) el.classList.add('layer-match');
    else el.classList.add('layer-mismatch');
  });

  State.data.eventPieces.forEach((ep) => {
    ep.element?.classList.remove('layer-above-hidden', 'layer-match', 'layer-mismatch');
  });

  if (filterOn && EditorState.selectedPieceRef && isMapPieceRef(EditorState.selectedPieceRef)) {
    const node = getSelectedNode(EditorState.selectedPieceRef);
    if (node && (node.m_drawLayer ?? 0) !== cur) clearSelection();
  }
}

/** Map Only visibility via LayerStack when available. */
export function applyMapOnlyVisibility(): void {
  const on = State.data.isMapOnly;
  const stack = tryGetLayerStack();
  if (stack) {
    stack.setMapOnly(on);
    return;
  }
  if (State.data.zombossContainer) State.data.zombossContainer.style.display = on ? 'none' : '';
  if (State.data.pathContainer) State.data.pathContainer.style.display = on ? 'none' : '';
  State.data.eventParallaxContainers.forEach((pContainer) => {
    const root = pContainer.parentElement as HTMLElement | null;
    if (root) root.style.display = on ? 'none' : '';
  });
  if (State.data.eventContainer) State.data.eventContainer.style.display = on ? 'none' : '';
}
