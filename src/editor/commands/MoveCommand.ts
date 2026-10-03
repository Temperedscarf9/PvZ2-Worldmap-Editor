import { State, pieceRuntimeMap } from '../../core/state';
import { CoordinateSystem } from '../../core/camera';
import { toGridCoords, fromGridCoords } from '../../utils/mathTool';
import { activePathPieces } from '../../render/PathRenderer';
import { PathFactory } from '../../scene/factories/PathFactory';
import { getSelectedNode, isDoodadRef, isEventNodeRef, isMapPieceRef } from '../types';
import { EditorState } from '../EditorState';
import { DOM } from '../../app/dom';
import { HistoryManager } from '../HistoryManager';

// Shared low-level helper: sorts `elements` by (y, x) and reassigns them the z-index values
// they already collectively held (just in their new sorted order). Reusing the existing
// z-index values - rather than inventing new ones - guarantees this never reaches outside
// the numeric range already reserved for this specific group, so it can never bleed into a
// sibling layer's stacking even when they share a common DOM parent.
function resortByPosition(elements: HTMLElement[], elementToNode: Map<HTMLElement, any>): void {
  if (elements.length <= 1) return;
  const parent = elements[0].parentElement;
  if (!parent) return;

  elements.sort((a, b) => {
    const nodeA = elementToNode.get(a);
    const nodeB = elementToNode.get(b);
    const yA = nodeA.m_position?.y ?? 0;
    const yB = nodeB.m_position?.y ?? 0;
    if (yA !== yB) return yA - yB;
    const xA = nodeA.m_position?.x ?? 0;
    const xB = nodeB.m_position?.x ?? 0;
    return xA - xB;
  });

  const zIndexes = elements
      .map(el => parseInt(el.style.zIndex || '0', 10))
      .filter(z => !isNaN(z))
      .sort((a, b) => a - b);

  elements.forEach((el, index) => {
    parent.appendChild(el);
    if (zIndexes.length > index) {
      el.style.zIndex = String(zIndexes[index]);
    }
  });
}

// 1. Map Pieces Layer: grouped per (parallaxLayer, drawLayer) container - m_mapPieces only.

function resortMapPiecesLayer(container: HTMLElement): void {
  if (!container) return;
  const elementToNode = new Map<HTMLElement, any>();
  State.data.pieces.forEach(p => {
    if (p.element && p.element.parentElement === container) elementToNode.set(p.element, p.piece);
  });
  resortByPosition(Array.from(elementToNode.keys()), elementToNode);
}


// 2. Zomboss Stage Layer: its own dedicated flat container.
function resortZombossLayer(): void {
  const container = State.data.zombossContainer;
  if (!container) return;
  const elementToNode = new Map<HTMLElement, any>();
  State.data.eventPieces.forEach(ep => {
    if (ep.isZombossStage === true && ep.element.parentElement === container) {
      elementToNode.set(ep.element, ep.node);
    }
  });
  resortByPosition(Array.from(elementToNode.keys()), elementToNode);
}

// 5. Event Layer: its own dedicated flat container (non-doodad, non-zomboss m_eventList).
function resortEventLayer(container: HTMLElement): void {
  if (!container) return;
  const elementToNode = new Map<HTMLElement, any>();
  State.data.eventPieces.forEach(ep => {
    if (ep.isZombossStage === true) return;
    if (ep.element.parentElement === container) {
      elementToNode.set(ep.element, ep.node);
    }
  });
  resortByPosition(Array.from(elementToNode.keys()), elementToNode);
}

// 3. Map Path Layer: only meaningful in linear mode - non-linear path tiles are fully
// rebuilt (and correctly ordered/z-indexed) from scratch inside updatePathElements() itself.
function resortMapPathLayer(): void {
  if (!State.data.isLinear) return;
  const container = State.data.pathContainer;
  if (!container || activePathPieces.length <= 1) return;

  const elementToNode = new Map<HTMLElement, any>();
  activePathPieces.forEach(p => {
    if (p.element.parentElement !== container) return;
    const y = ((p.fromNode?.m_position?.y ?? 0) + (p.toNode?.m_position?.y ?? 0)) / 2;
    const x = ((p.fromNode?.m_position?.x ?? 0) + (p.toNode?.m_position?.x ?? 0)) / 2;
    elementToNode.set(p.element, { m_position: { x, y } });
  });
  resortByPosition(Array.from(elementToNode.keys()), elementToNode);
}

// ---- Drag-time path update throttling (non-linear mode only) ----
// Non-linear updatePathElements() fully clears and rebuilds every grid path tile
// (compileGridTilesSync walks the entire eventList). mousemove can fire many times within a
// single animation frame (high-poll-rate mice/trackpads), so calling it unconditionally on
// every mousemove - as this used to do - could trigger dozens of full rebuilds per second of
// dragging. Coalesce to at most one rebuild per rendered frame instead; linear mode's per-call
// cost is just a CSS transform string update, so it stays immediate/uncoalesced.
let pendingPathUpdateFrame: number | null = null;

function schedulePathUpdate(): void {
  if (State.data.isLinear) {
    PathFactory.refreshAfterMove();
    return;
  }
  if (pendingPathUpdateFrame !== null) return;
  pendingPathUpdateFrame = requestAnimationFrame(() => {
    pendingPathUpdateFrame = null;
    PathFactory.refreshAfterMove();
  });
}

/** Cancels any pending coalesced rebuild so a caller about to force an immediate, authoritative
 * update (e.g. drag end) doesn't leave a redundant extra rebuild queued right behind it. */
function cancelPendingPathUpdate(): void {
  if (pendingPathUpdateFrame !== null) {
    cancelAnimationFrame(pendingPathUpdateFrame);
    pendingPathUpdateFrame = null;
  }
}

/**
 * Screen → data for a node on parallax layer L.
 * Render places the node at CSS left = dataX * scale inside a layer root that is also
 * translated by (L/10)*dx (dx = vpWorldLeft - boxLeft). Inverse that so the data we write
 * is the rest-pose coordinate (what re-render and export expect), not the already-shifted
 * visual coordinate.
 */
function screenToDataOnLayer(
  clientX: number,
  clientY: number,
  parallaxLayer: number
): { x: number; y: number } {
  const scale = State.data.textureResolution / 600;
  const rect = DOM.viewport.getBoundingClientRect();
  const world = CoordinateSystem.screenToWorld(clientX - rect.left, clientY - rect.top);
  const vpWorldLeft = CoordinateSystem.screenToWorld(0, 0).x;
  const dx = vpWorldLeft - (State.data.boxLeft || 0);
  const parallaxOffsetX = (parallaxLayer / 10) * dx;
  return {
    x: (world.x - parallaxOffsetX) / scale,
    y: world.y / scale,
  };
}

/**
 * Call once at mousedown when a piece/event drag begins. Records start mouse, start data
 * position, and the grab offset in data space after inverse-parallax conversion so move
 * frames keep the original click point under the cursor on any m_parallaxLayer.
 */
export function beginPieceDrag(node: { m_position?: { x?: number; y?: number }; m_parallaxLayer?: number }, e: MouseEvent): void {
  // Capture pre-drag position once; endGesture runs on mouseup.
  HistoryManager.recordBefore('移动对象');
  const posX = node.m_position?.x || 0;
  const posY = node.m_position?.y || 0;
  const layer = Number(node.m_parallaxLayer ?? 0);
  const underCursor = screenToDataOnLayer(e.clientX, e.clientY, layer);
  EditorState.isDraggingPiece = true;
  EditorState.hasActuallyDragged = false;
  EditorState.dragStartMousePos.x = e.clientX;
  EditorState.dragStartMousePos.y = e.clientY;
  EditorState.dragStartPiecePos.x = posX;
  EditorState.dragStartPiecePos.y = posY;
  EditorState.dragGrabOffset.x = posX - underCursor.x;
  EditorState.dragGrabOffset.y = posY - underCursor.y;
}

/**
 * Applies one mousemove's worth of drag to the currently-selected piece: recomputes its
 * data position via the inverse of the layer's parallax translate (with grab offset so the
 * click point stays under the cursor), patches every DOM element mounted for that node in
 * place (no re-render), and resorts only the layer container(s) it actually lives in.
 * Caller (EditorApp's handleDrag) is expected to have already checked
 * `EditorState.isDraggingPiece && EditorState.selectedPieceRef` before calling this.
 */
export function applyDragMove(e: MouseEvent): void {
  const selectedPieceRef = EditorState.selectedPieceRef;
  if (!selectedPieceRef) return;
  const node = getSelectedNode(selectedPieceRef);
  if (!node) return;

  const deltaX = e.clientX - EditorState.dragStartMousePos.x;
  const deltaY = e.clientY - EditorState.dragStartMousePos.y;
  if (Math.hypot(deltaX, deltaY) > 2) {
    EditorState.hasActuallyDragged = true;
  }

  const scale = State.data.textureResolution / 600;
  const layer = Number(node.m_parallaxLayer ?? 0);
  // Inverse-parallax data under the cursor + grab offset recorded at mousedown.
  const underCursor = screenToDataOnLayer(e.clientX, e.clientY, layer);
  let newX = underCursor.x + EditorState.dragGrabOffset.x;
  let newY = underCursor.y + EditorState.dragGrabOffset.y;

  // ---- 吸附网格（根据类型守卫决定吸附方式） ----
  if (State.data.moveSnapEnabled) {
    // 使用类型守卫判断
    if (isMapPieceRef(selectedPieceRef) || isDoodadRef(selectedPieceRef)) {
      // MapPiece 和 Doodad 直接取整
      newX = Math.round(newX);
      newY = Math.round(newY);
    } else if (isEventNodeRef(selectedPieceRef)) {
      // 普通事件节点（非 doodad）使用网格坐标转换
      const { col, row } = toGridCoords(newX * 3, newY * 3, true);
      const snapped = fromGridCoords(col, row);
      newX = snapped.x / 3;
      newY = snapped.y / 3;
    }
    // 其他类型（如 path_node）不吸附
  }

  // 更新节点位置
  node.m_position = node.m_position || { x: 0, y: 0 };
  node.m_position.x = newX;
  node.m_position.y = newY;

  // ---- 更新所有关联元素的 CSS 位置（性能优化） ----
  const pxLeft = newX * scale;
  const pxTop = newY * scale;
  const half = (State.data.textureResolution / 1536) * 50;

  // 更新 PieceInfo 元素
  State.data.pieces.forEach(p => {
    if (p.piece === node) {
      p.element.style.left = `${pxLeft - half}px`;
      p.element.style.top = `${pxTop - half}px`;
      const runtime = pieceRuntimeMap.get(p.piece);
      if (runtime) {
        runtime.worldX = pxLeft;
        runtime.worldY = pxTop;
      }
    }
  });

  // 更新 EventPieceInfo 元素
  State.data.eventPieces.forEach(ep => {
    if (ep.node === node) {
      ep.element.style.left = `${pxLeft - half}px`;
      ep.element.style.top = `${pxTop - half}px`;
    }
  });

  // ---- 重排当前节点所属的图层（仅重排受影响容器） ----
  if (isMapPieceRef(selectedPieceRef)) {
    const containers = new Set<HTMLElement>();
    State.data.pieces.forEach(p => {
      if (p.piece === node && p.element?.parentElement) {
        containers.add(p.element.parentElement);
      }
    });
    containers.forEach(c => resortMapPiecesLayer(c));
  } else {
    const isZomboss = State.data.eventPieces.some(
        ep => ep.node === node && ep.isZombossStage === true
    );
    if (isZomboss) {
      resortZombossLayer();
    } else {
      // doodad 与其它 event 同一套 Event 层
      const containers = new Set<HTMLElement>();
      State.data.eventPieces.forEach(ep => {
        if (ep.node === node && ep.isZombossStage !== true && ep.element?.parentElement) {
          containers.add(ep.element.parentElement);
        }
      });
      containers.forEach(c => resortEventLayer(c));
    }
  }

  schedulePathUpdate();
  resortMapPathLayer();
}
export function finalizeDragPathUpdate(): void {
  if (State.data.isLinear) return;
  cancelPendingPathUpdate();
  PathFactory.refreshAfterMove();
  resortMapPathLayer();
}