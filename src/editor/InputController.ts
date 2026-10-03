/**
 * InputController — viewport pointer interaction (pan, zoom, tool hit-testing).
 *
 * Owns mousedown / mousemove / mouseup / wheel on the map viewport.
 * Tool mode decisions still read EditorState; mutations go through commands + factories.
 */

import { State } from '../core/state';
import { CoordinateSystem, ZoomHelper } from '../core/camera';
import { Matrix } from '../utils/mathTool';
import { DOM, showConfirmModal } from '../app/dom';
import { showToast } from '../ui/toast';
import { EditorState } from './EditorState';
import { clearSelection, selectPiece } from './Selection';
import { getSelectedNode } from './types';
import {
  refreshSingleObject,
  mountNewObject,
} from './ObjectMount';
import { deletePieceOrNode } from './commands/DeleteCommand';
import { addNewMapPiece, addNewDoodad, addNewEventNode } from './commands/AddCommand';
import { flipNode } from './commands/FlipCommand';
import { applyDragMove, beginPieceDrag, finalizeDragPathUpdate } from './commands/MoveCommand';
import { refreshKeyGateFlagsAffectedBy } from './ObjectMount';
import { openRotatePanel, hasActiveRotateTarget } from './commands/RotateCommand';
import { openEventEditorModal } from './EventPropertyEditor';
import { autoSaveToLocalStorage } from './MapIO';
import { HistoryManager } from './HistoryManager';
import { updateInspector } from '../ui/sidebar';

/** Set node.m_drawLayer to EditorState.defaultDrawLayer and remount. */
async function applyChangeLayer(node: any, mode: 'reload' | 'transform' = 'reload'): Promise<void> {
  const next = EditorState.defaultDrawLayer;
  if ((node.m_drawLayer ?? 0) === next) {
    showToast(`已是绘制层 ${next}`);
    return;
  }
  HistoryManager.recordBefore('修改绘制层');
  node.m_drawLayer = next;
  await refreshSingleObject(node, mode);
  HistoryManager.endGesture();
  updateInspector();
  showToast(`绘制层 → ${next}`);
}

const UI_CHROME_SELECTORS = [
  '#editor-toolbar',
  '#sidebar-right',
  '.controls-bar',
  '#intro-modal',
  '#confirm-modal-overlay',
  '.modal',
  '.modal-overlay',
  '.event-editor-overlay',
  '.event-editor-modal',
  '#toast',
  '.editor-toast',
  '#rotate-panel',
] as const;

function isUIChrome(target: HTMLElement): boolean {
  return UI_CHROME_SELECTORS.some((sel) => !!target.closest(sel));
}

function dataCoordsFromEvent(e: MouseEvent): { mapX: number; mapY: number } {
  const rect = DOM.viewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const worldPos = CoordinateSystem.screenToWorld(mouseX, mouseY);
  const scale = State.data.textureResolution / 600;
  return { mapX: worldPos.x / scale, mapY: worldPos.y / scale };
}

export type InputControllerDeps = {
  /** Full re-render (e.g. after event delete). */
  triggerMapRender: () => Promise<void>;
};

let deps: InputControllerDeps | null = null;

function handleDrag(e: MouseEvent): void {
  if (EditorState.isDraggingPiece && EditorState.selectedPieceRef) {
    applyDragMove(e);
    return;
  }
  if (!State.interaction.isDragging) return;
  const deltaX = e.clientX - State.interaction.lastMouseX;
  const deltaY = e.clientY - State.interaction.lastMouseY;
  State.interaction.velocityX = deltaX;
  State.interaction.velocityY = deltaY;
  EditorState.targetCamera.x += deltaX / State.camera.scale;
  EditorState.targetCamera.y += deltaY / State.camera.scale;
  State.interaction.lastMouseX = e.clientX;
  State.interaction.lastMouseY = e.clientY;
}

async function handleMouseDown(e: MouseEvent): Promise<void> {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (isUIChrome(target)) return;
  if (hasActiveRotateTarget()) {
    if (target.closest('#rotate-panel')) return;
    return;
  }

  const { mapX, mapY } = dataCoordsFromEvent(e);

  // Pan
  if (EditorState.isPanActive) {
    State.interaction.isDragging = true;
    State.interaction.lastMouseX = e.clientX;
    State.interaction.lastMouseY = e.clientY;
    State.interaction.velocityX = 0;
    State.interaction.velocityY = 0;
    DOM.viewport.style.cursor = 'grabbing';
    return;
  }

  // Select
  if (EditorState.toolMode === 'select') {
    const matchPiece = State.data.pieces.find((p) => p.element.contains(e.target as Node));
    const matchEvent = State.data.eventPieces.find((p) => p.element.contains(e.target as Node));
    const selectedRef: any = matchPiece || matchEvent;
    if (selectedRef) {
      selectPiece(selectedRef);
      const node = selectedRef.piece || selectedRef.node;
      beginPieceDrag(node, e);
      e.stopPropagation();
    } else {
      clearSelection();
    }
    return;
  }

  // Island
  if (EditorState.toolMode === 'island') {
    if (EditorState.drawSubMode === 'none') {
      showToast('请先激活 添加 / 移动 / 翻转 / 旋转 / 改层 / 删除');
      return;
    }
    if (EditorState.drawSubMode === 'add') {
      const newPiece = addNewMapPiece(mapX, mapY);
      if (newPiece) {
        await mountNewObject(newPiece, 'piece');
        showToast('已放置新的地图元素');
      }
      return;
    }
    const selectedRef = State.data.pieces.find((p) => p.element.contains(e.target as Node));
    if (!selectedRef) {
      clearSelection();
      return;
    }
    selectPiece(selectedRef);
    const node = selectedRef.piece;
    e.stopPropagation();

    if (EditorState.drawSubMode === 'move') {
      beginPieceDrag(node, e);
    } else if (EditorState.drawSubMode === 'flip') {
      await flipNode(node, 'transform');
    } else if (EditorState.drawSubMode === 'rotation') {
      openRotatePanel(node, 'piece');
    } else if (EditorState.drawSubMode === 'changeLayer') {
      await applyChangeLayer(node, 'reload');
    } else if (EditorState.drawSubMode === 'delete') {
      const confirmDel = await showConfirmModal('确定删除选中的岛屿元素吗？\n\nDelete this map piece?');
      if (confirmDel) {
        deletePieceOrNode(node);
        await refreshSingleObject(node, 'remove');
        showToast('已删除地图元素');
      }
    }
    return;
  }

  // Doodad
  if (EditorState.toolMode === 'doodad') {
    if (EditorState.drawSubMode === 'none') {
      showToast('请先激活 添加 / 移动 / 翻转 / 旋转 / 改层 / 删除');
      return;
    }
    if (EditorState.drawSubMode === 'add') {
      const newDoodad = addNewDoodad(mapX, mapY);
      if (newDoodad) {
        await mountNewObject(newDoodad, 'doodad');
        showToast('已放置新的装饰物');
      }
      return;
    }
    const selectedRef = State.data.eventPieces.find(
      (p) => p.element.contains(e.target as Node) && p.node.m_eventType === 'doodad'
    );
    if (!selectedRef) {
      clearSelection();
      return;
    }
    selectPiece(selectedRef);
    const node = selectedRef.node;
    e.stopPropagation();

    if (EditorState.drawSubMode === 'move') {
      beginPieceDrag(node, e);
    } else if (EditorState.drawSubMode === 'flip') {
      await flipNode(node, 'reload');
    } else if (EditorState.drawSubMode === 'rotation') {
      openRotatePanel(node, 'doodad');
    } else if (EditorState.drawSubMode === 'changeLayer') {
      await applyChangeLayer(node, 'reload');
    } else if (EditorState.drawSubMode === 'delete') {
      const confirmDel = await showConfirmModal('确定删除选中的装饰物吗？\n\nDelete this doodad?');
      if (confirmDel) {
        deletePieceOrNode(node);
        await refreshSingleObject(node, 'remove');
        showToast('已删除装饰物');
      }
    }
    return;
  }

  // Event
  if (EditorState.toolMode === 'event') {
    const matchEvent = State.data.eventPieces.find(
      (p) => p.element.contains(e.target as Node) && p.node.m_eventType !== 'doodad'
    );

    if (EditorState.eventSubMode === 'move') {
      if (matchEvent) {
        selectPiece(matchEvent);
        finalizeDragPathUpdate();
        beginPieceDrag(matchEvent.node, e);
        e.stopPropagation();
      } else {
        clearSelection();
      }
    } else if (EditorState.eventSubMode === 'edit') {
      if (matchEvent) {
        selectPiece(matchEvent);
        openEventEditorModal(matchEvent.node);
        e.stopPropagation();
      } else {
        clearSelection();
      }
    } else if (EditorState.eventSubMode === 'delete') {
      if (matchEvent) {
        selectPiece(matchEvent);
        e.stopPropagation();
        const confirmDel = await showConfirmModal(
          '确定删除这个事件节点吗？\n\nAre you sure you want to delete this event node?'
        );
        if (confirmDel) {
          deletePieceOrNode(matchEvent.node);
          await deps?.triggerMapRender();
          clearSelection();
          showToast('已删除事件节点');
        }
      } else {
        clearSelection();
      }
    } else if (EditorState.eventSubMode === 'add') {
      const newNode = addNewEventNode(EditorState.pendingEventType, mapX, mapY);
      if (newNode) {
        await mountNewObject(newNode, 'event');
        showToast(`已放置新的 ${EditorState.pendingEventType} 节点`);
      }
    }
  }
}

function handleMouseUp(): void {
  if (EditorState.isDraggingPiece) {
    EditorState.isDraggingPiece = false;
    if (EditorState.selectedPieceRef && EditorState.hasActuallyDragged) {
      autoSaveToLocalStorage();
      HistoryManager.endGesture();
      updateInspector();
      const moved = getSelectedNode(EditorState.selectedPieceRef);
      if (moved) {
        finalizeDragPathUpdate();
        // key_gate flags bake parent-relative offsets at mount time — rebuild them.
        void refreshKeyGateFlagsAffectedBy(moved);
      }
    } else {
      // Pure click: drop the unused pre-drag snapshot
      HistoryManager.discardLast('移动对象');
      HistoryManager.endGesture();
      if (
        EditorState.selectedPieceRef &&
        !EditorState.hasActuallyDragged &&
        EditorState.toolMode === 'event' &&
        EditorState.eventSubMode === 'edit'
      ) {
        const node = getSelectedNode(EditorState.selectedPieceRef);
        if (node && node.m_eventType !== 'doodad') {
          openEventEditorModal(node);
        }
      }
    }
  }
  State.interaction.isDragging = false;
  DOM.viewport.style.cursor = EditorState.isPanActive ? 'grab' : 'default';
}

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const rect = DOM.viewport.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const targetWorldMatrix = Matrix.multiply(
    Matrix.scale(EditorState.targetCamera.scale, EditorState.targetCamera.scale),
    Matrix.translate(EditorState.targetCamera.x, EditorState.targetCamera.y)
  );
  const invTargetMatrix = Matrix.inverse(targetWorldMatrix);
  const targetWorldPoint = Matrix.transformPoint(invTargetMatrix, mx, my);

  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const newScale = ZoomHelper.clamp(EditorState.targetCamera.scale * factor, DOM.viewport.clientHeight);
  if (newScale === EditorState.targetCamera.scale) return;
  EditorState.targetCamera.scale = newScale;
  EditorState.targetCamera.x = mx / newScale - targetWorldPoint.x;
  EditorState.targetCamera.y = my / newScale - targetWorldPoint.y;
}

export const InputController = {
  bind(d: InputControllerDeps): void {
    deps = d;
    DOM.viewport.onmousedown = (e) => {
      void handleMouseDown(e);
    };
    window.onmousemove = handleDrag;
    window.onmouseup = () => handleMouseUp();
    DOM.viewport.onwheel = handleWheel;
  },

  unbind(): void {
    DOM.viewport.onmousedown = null;
    window.onmousemove = null;
    window.onmouseup = null;
    DOM.viewport.onwheel = null;
    deps = null;
  },
};
