import { State, pieceRuntimeMap } from '../core/state';
import { degreeToRad } from '../utils/mathTool';
import { getWorldAnimationBoundary } from '../core/worldMeta';
import { CameraController } from '../editor/CameraController';
import { renderMap } from '../render/MapRenderer';
import { computeLocalTransform } from '../render/PieceLoader';

import { DOM, showConfirmModal } from './dom';
import { showToast } from '../ui/toast';
import { runWithDeferredLoading } from '../ui/loading';
import { updateToolbarState } from '../ui/toolbar';
import { bindAppShell } from './AppShell';

import { EditorState, EVENT_TYPE_CYCLE } from '../editor/EditorState';
import { setTriggerMapRender } from '../editor/renderTrigger';
import { getSelectedNode, isDoodadRef, isEventPieceRef, isMapPieceRef } from '../editor/types';
import { clearSelection, selectPiece } from '../editor/Selection';
import { ToolController } from '../editor/ToolController';
import { InputController } from '../editor/InputController';
import { SettingsController } from '../editor/SettingsController';
import { bindViewportOverlays, onViewportResize } from '../editor/ViewportOverlays';
import {
  refreshSingleObject,
  mountNewObject,
  applyMapOnlyVisibility,
  applyTransformOnly,
} from '../editor/ObjectMount';
import { deletePieceOrNode } from '../editor/commands/DeleteCommand';
import { addNewEventNode, cycleImageId } from '../editor/commands/AddCommand';
import { finalizeDragPathUpdate } from '../editor/commands/MoveCommand';
import { bindRotatePanel } from '../editor/commands/RotateCommand';
import { handleSaveMap, handleResetMap } from '../editor/MapIO';
import { HistoryManager } from '../editor/HistoryManager';
import { bindItemShopTabs, refreshItemShop, updateInspector } from '../ui/sidebar';

export const EditorApp = (() => {
  function handleUpdateTransform(): void {
    CameraController.applyTransform();
  }

  function handleResetCamera(): void {
    CameraController.reset();
  }

  async function triggerMapRender(options: { eventOnly?: boolean; resetCamera?: boolean } = {}): Promise<void> {
    try {
      if (!options.eventOnly) {
        EditorState.rotatingPieces = [];
      }
      await renderMap(DOM.mapContainer, DOM.emptyBorder, handleResetCamera, options);

      // Re-select active element if it's still present in the updated render lists
      if (EditorState.selectedPieceRef) {
        const node = getSelectedNode(EditorState.selectedPieceRef);
        if (node) {
          const matchPiece = State.data.pieces.find(p => p.piece.m_name === node.m_name || p.piece.m_eventId === node.m_eventId);
          const matchEvent = State.data.eventPieces.find(p => p.node.m_name === node.m_name || p.node.m_eventId === node.m_eventId);
          const reFound = matchPiece || matchEvent;
          if (reFound) {
            selectPiece(reFound);
          } else {
            clearSelection();
          }
        }
      } else {
        updateToolbarState();
      }
    } catch (err) {
      console.error('Error rendering map:', err);
    }
  }
  // PAM player time budget per ~16.6ms frame. Tight while UI wants input priority.
  const FRAME_BUDGET_MS = 10;
  const FRAME_BUDGET_MS_TIGHT = 3;

  function tick(timestamp: number): void {
    const dt = timestamp - (State.interaction.lastFrameTime || timestamp);
    State.interaction.lastFrameTime = timestamp;
    const dtSeconds = dt / 1000;

    CameraController.tickFrame(dt, dtSeconds);

    // Continuous rotation on pieces with m_rotationRate
    if (EditorState.rotatingPieces.length === 0 && State.data.pieces.length > 0) {
      EditorState.rotatingPieces = State.data.pieces.filter((pInfo) => pInfo.piece.m_rotationRate);
    }
    for (const pInfo of EditorState.rotatingPieces) {
      if (pInfo.piece.m_rotationRate) {
        const runtime = pieceRuntimeMap.get(pInfo.piece);
        if (runtime) {
          runtime.angle = (runtime.angle || 0) + degreeToRad(pInfo.piece.m_rotationRate * dtSeconds);
          const maxImageId = getWorldAnimationBoundary();
          const visualEl = pInfo.element.querySelector('.map-piece-visual') as HTMLDivElement;
          const t = computeLocalTransform(pInfo.piece, maxImageId);
          if (visualEl) visualEl.style.transform = t;
          else pInfo.element.style.transform = t;
        }
      }
    }

    // Time-budgeted PAM player ticks (rotate cursor across frames under tight budget)
    const now = performance.now();
    const totalPlayers = State.players.length;
    if (totalPlayers > 0) {
      const budgetMs = EditorState.uiFocusDepth > 0 ? FRAME_BUDGET_MS_TIGHT : FRAME_BUDGET_MS;
      const budgetStart = performance.now();
      let processed = 0;
      let cursor = EditorState.playerTickCursor % totalPlayers;
      while (processed < totalPlayers) {
        const p = State.players[cursor];
        if (p) p.tick(now);
        cursor = (cursor + 1) % totalPlayers;
        processed++;
        if (processed < totalPlayers && performance.now() - budgetStart > budgetMs) break;
      }
      EditorState.playerTickCursor = cursor;
    }

    requestAnimationFrame(tick);
  }
  function bindEvents(): void {
    const ui = DOM.uiElements;

    bindAppShell({ resetCamera: handleResetCamera });

    // 1. Left modes + Pan — all mutual exclusion lives in ToolController
    if (ui.modeIsland) ui.modeIsland.onclick = () => ToolController.setModeIsland();
    if (ui.modeDoodad) ui.modeDoodad.onclick = () => ToolController.setModeDoodad();
    if (ui.modeEvent) ui.modeEvent.onclick = () => ToolController.setModeEvent();
    if (ui.modeSelect) ui.modeSelect.onclick = () => ToolController.setModeSelect();
    if (ui.btnPan) ui.btnPan.onclick = () => ToolController.togglePan();
    if (ui.btnSnapToggle) {
      ui.btnSnapToggle.onclick = () => {
        State.data.moveSnapEnabled = !State.data.moveSnapEnabled;
        updateToolbarState();
        showToast(State.data.moveSnapEnabled ? '已开启网格吸附' : '已关闭网格吸附');
      };
    }
    if (ui.btnMapOnly) {
      ui.btnMapOnly.onclick = () => {
        State.data.isMapOnly = !State.data.isMapOnly;
        updateToolbarState();
        applyMapOnlyVisibility();
        showToast(State.data.isMapOnly ? '仅地图视图已开启' : '完整视图已开启');
      };
    }

    // 3. Middle Island/Doodad Buttons
    if (ui.btnAdd) ui.btnAdd.onclick = () => ToolController.setDrawSub('add');
    if (ui.btnMove) ui.btnMove.onclick = () => ToolController.setDrawSub('move');
    if (ui.btnImgPrev) {
      ui.btnImgPrev.onclick = async () => {
        if (EditorState.selectedPieceRef) {
          const node = getSelectedNode(EditorState.selectedPieceRef);
          if (!node) return;
          HistoryManager.recordBefore('切换 Image ID');
          const nextId = cycleImageId(node.m_imageID ?? 0, -1);
          node.m_imageID = nextId;
          await refreshSingleObject(node, 'reload');
          HistoryManager.endGesture();
          showToast(`Image ID → ${nextId}`);
        } else {
          EditorState.defaultImageID = cycleImageId(EditorState.defaultImageID, -1);
          showToast(`默认 Image ID 已设为 ${EditorState.defaultImageID}`);
        }
        updateToolbarState();
      };
    }
    if (ui.btnImgNext) {
      ui.btnImgNext.onclick = async () => {
        if (EditorState.selectedPieceRef) {
          const node = getSelectedNode(EditorState.selectedPieceRef);
          if (!node) return;
          HistoryManager.recordBefore('切换 Image ID');
          const nextId = cycleImageId(node.m_imageID ?? 0, 1);
          node.m_imageID = nextId;
          await refreshSingleObject(node, 'reload');
          HistoryManager.endGesture();
          showToast(`Image ID → ${nextId}`);
        } else {
          EditorState.defaultImageID = cycleImageId(EditorState.defaultImageID, 1);
          showToast(`默认 Image ID 已设为 ${EditorState.defaultImageID}`);
        }
        updateToolbarState();
      };
    }
    if (ui.btnCurLayer) {
      ui.btnCurLayer.onclick = () => {
        if (EditorState.toolMode !== 'island' && EditorState.toolMode !== 'doodad') return;
        EditorState.isCurLayerActive = !EditorState.isCurLayerActive;
        updateToolbarState();
        showToast(
            EditorState.isCurLayerActive
                ? `CurLayer 已激活：覆盖层已隐藏，默认层 ${EditorState.defaultDrawLayer}`
                : 'CurLayer 已关闭：全部显示'
        );
      };
    }
    if (ui.btnLayerDec) {
      ui.btnLayerDec.onclick = () => {
        if (!EditorState.isCurLayerActive) return;
        if (EditorState.toolMode !== 'island' && EditorState.toolMode !== 'doodad') return;
        EditorState.defaultDrawLayer = Math.max(-36, EditorState.defaultDrawLayer - 1);
        updateToolbarState();
        showToast(`默认绘制图层 → ${EditorState.defaultDrawLayer}`);
      };
    }
    if (ui.btnLayerInc) {
      ui.btnLayerInc.onclick = () => {
        if (!EditorState.isCurLayerActive) return;
        if (EditorState.toolMode !== 'island' && EditorState.toolMode !== 'doodad') return;
        EditorState.defaultDrawLayer = Math.min(10, EditorState.defaultDrawLayer + 1);
        updateToolbarState();
        showToast(`默认绘制图层 → ${EditorState.defaultDrawLayer}`);
      };
    }
    if (ui.btnRotation) ui.btnRotation.onclick = () => ToolController.setDrawSub('rotation');
    if (ui.btnFlip) ui.btnFlip.onclick = () => ToolController.setDrawSub('flip');
    if (ui.btnDelete) ui.btnDelete.onclick = () => ToolController.setDrawSub('delete');

    // 4. Middle Event Buttons — ToolController owns mutual exclusion + toasts
    if (ui.btnEventType) {
      ui.btnEventType.onclick = () => {
        const idx = EVENT_TYPE_CYCLE.indexOf(EditorState.pendingEventType);
        EditorState.pendingEventType = EVENT_TYPE_CYCLE[(idx + 1) % EVENT_TYPE_CYCLE.length];
        updateToolbarState();
        showToast(`已选择事件类型：${EditorState.pendingEventType}`);
      };
    }
    if (ui.btnEventAdd) ui.btnEventAdd.onclick = () => ToolController.setEventSub('add');
    if (ui.btnEventMove) ui.btnEventMove.onclick = () => ToolController.setEventSub('move');
    if (ui.btnEventEdit) ui.btnEventEdit.onclick = () => ToolController.setEventSub('edit');
    if (ui.btnEventDelete) ui.btnEventDelete.onclick = () => ToolController.setEventSub('delete');
    if (ui.btnAppend) {
      ui.btnAppend.onclick = async () => {
        if (EditorState.selectedPieceRef && isEventPieceRef(EditorState.selectedPieceRef)) {
          const parentNode = EditorState.selectedPieceRef.node;
          const mapX = (parentNode.m_position?.x ?? 0) + 80;
          const mapY = parentNode.m_position?.y ?? 0;
          const newPathNode = addNewEventNode('path_node', mapX, mapY, parentNode.m_name);
          if (newPathNode) {
            await mountNewObject(newPathNode, 'event');
            showToast('已追加连接到父节点的 path_node');
          }
        }
      };
    }

    // 5. Select Action
    if (ui.btnSelectDelete) {
      ui.btnSelectDelete.onclick = async () => {
        if (EditorState.selectedPieceRef) {
          const node = getSelectedNode(EditorState.selectedPieceRef);
          const confirmDel = await showConfirmModal('确定删除选中的节点吗？\n\nAre you sure you want to delete this node?');
          if (confirmDel) {
            deletePieceOrNode(node);
            await refreshSingleObject(node, 'remove');
            showToast('已删除选中节点');
          }
        }
      };
    }

    if (ui.btnSaveMap) ui.btnSaveMap.onclick = handleSaveMap;
    if (ui.btnResetMap) ui.btnResetMap.onclick = handleResetMap;

    const wireHistoryBtn = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.onclick = () => void fn();
    };
    wireHistoryBtn('btn-undo', () => HistoryManager.undo());
    wireHistoryBtn('btn-redo', () => HistoryManager.redo());
    wireHistoryBtn('btn-undo-side', () => HistoryManager.undo());
    wireHistoryBtn('btn-redo-side', () => HistoryManager.redo());
    HistoryManager.refreshUI();
    bindItemShopTabs();
    refreshItemShop();

    // Global Key Bindings for pro map editing speed
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        void HistoryManager.undo();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        void HistoryManager.redo();
        return;
      }

      // WASD nudge selected node (before tool hotkeys so S does not switch Select)
      if (
        EditorState.selectedPieceRef &&
        !EditorState.isPanActive &&
        !(e.ctrlKey || e.metaKey) &&
        (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D' ||
          e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S')
      ) {
        e.preventDefault();
        const node = getSelectedNode(EditorState.selectedPieceRef);
        if (node) {
          const step = e.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;
          if (e.key === 'a' || e.key === 'A') dx = -step;
          if (e.key === 'd' || e.key === 'D') dx = step;
          if (e.key === 'w' || e.key === 'W') dy = -step;
          if (e.key === 's' || e.key === 'S') dy = step;
          if (dx || dy) {
            HistoryManager.recordBefore('微调坐标');
            node.m_position = node.m_position || { x: 0, y: 0 };
            node.m_position.x = Math.round((node.m_position.x || 0) + dx);
            node.m_position.y = Math.round((node.m_position.y || 0) + dy);
            applyTransformOnly(node);
            try {
              finalizeDragPathUpdate();
            } catch {
              /* optional */
            }
            HistoryManager.endGesture();
            updateInspector();
          }
        }
        return;
      }

      // Ctrl/Cmd+S is handled below — plain S is Select mode when nothing selected
      if (!(e.ctrlKey || e.metaKey) && ToolController.handleHotkey(e.key)) {
        return;
      } else if ((e.key === 'r' || e.key === 'R') && EditorState.selectedPieceRef) {
        if (ui.btnRotation && !ui.btnRotation.disabled) {
          ui.btnRotation.click();
        }
      } else if ((e.key === 'f' || e.key === 'F') && EditorState.selectedPieceRef) {
        if (ui.btnFlip && !ui.btnFlip.disabled) {
          ui.btnFlip.click();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (EditorState.toolMode === 'island' || EditorState.toolMode === 'doodad') {
          if (ui.btnFlip) ui.btnFlip.click();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && EditorState.selectedPieceRef) {
        e.preventDefault();
        const isDeletableByDeleteBtn = isMapPieceRef(EditorState.selectedPieceRef) || isDoodadRef(EditorState.selectedPieceRef);
        if (isDeletableByDeleteBtn) {
          if (ui.btnDelete && !ui.btnDelete.disabled) ui.btnDelete.click();
        } else {
          if (ui.btnEventDelete && !ui.btnEventDelete.disabled) ui.btnEventDelete.click();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        State.data.isMapOnly = !State.data.isMapOnly;
        updateToolbarState();
        applyMapOnlyVisibility();
        if (State.data.isMapOnly) {
          showToast('仅地图模式（事件节点已隐藏）');
        } else {
          showToast('完整渲染模式（全部元素已显示）');
        }
      } else if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
        if (State.data.mapConfig) {
          e.preventDefault();
          handleSaveMap();
        }
      }
    });

    SettingsController.bind({
      triggerMapRender: (opts) => triggerMapRender(opts),
    });

    ui.resetButton.onclick = handleResetCamera;

    // Viewport pointer: pan / zoom / tool hit-testing
    InputController.bind({
      triggerMapRender: () => triggerMapRender(),
    });

    window.addEventListener('trigger-map-render', () => {
      // EventLoader status/star preview toggles — eventOnly avoids remounting map pieces.
      runWithDeferredLoading('正在更新预览状态…', '', () => triggerMapRender({ eventOnly: true }));
    });
  }

  function init(): void {
    setTriggerMapRender(triggerMapRender);
    bindViewportOverlays();
    bindEvents();
    bindRotatePanel();
    updateToolbarState();
    window.addEventListener('resize', () => onViewportResize(handleResetCamera));
    requestAnimationFrame(tick);
  }

  return { init };
})();