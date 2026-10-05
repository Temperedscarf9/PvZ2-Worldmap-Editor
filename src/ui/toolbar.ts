import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState } from '../editor/EditorState';
import { isDoodadRef, isEventNodeRef, isMapPieceRef } from '../editor/types';
import { applyDrawLayerFilter } from '../editor/ObjectMount';

/**
 * 切换 Island/Doodad 子工具（Add/Move/Flip/Rotation/Delete 互斥）。
 * 再次点击同一按钮 → 关闭为 none；开启时强制关掉 Pan。
 * 不影响 eventSubMode（由模式切换统一清理）。
 */
export function setDrawSubMode(mode: typeof EditorState.drawSubMode): void {
  if (mode === 'none' || EditorState.drawSubMode === mode) {
    EditorState.drawSubMode = 'none';
  } else {
    EditorState.drawSubMode = mode;
    EditorState.isPanActive = false;
  }
  updateToolbarState();
}

/**
 * 切换 Event 子工具（Add/Move/Edit/Delete 互斥）。
 * 再次点击同一按钮 → 关闭为 none；开启时强制关掉 Pan。
 * 不影响 drawSubMode（由模式切换统一清理）。
 */
export function setEventSubMode(mode: typeof EditorState.eventSubMode): void {
  if (mode === 'none' || EditorState.eventSubMode === mode) {
    EditorState.eventSubMode = 'none';
  } else {
    EditorState.eventSubMode = mode;
    EditorState.isPanActive = false;
  }
  updateToolbarState();
}
export function updateToolbarState(): void {
  const ui = DOM.uiElements;
  const selectedPieceRef = EditorState.selectedPieceRef;
  const toolMode = EditorState.toolMode;
  const drawSubMode = EditorState.drawSubMode;
  const eventSubMode = EditorState.eventSubMode;
  const isPanActive = EditorState.isPanActive;
  const isCurLayerActive = EditorState.isCurLayerActive;
  const defaultDrawLayer = EditorState.defaultDrawLayer;
  const pendingEventType = EditorState.pendingEventType;

  const hasSelection = !!selectedPieceRef;
  const isEventNode = selectedPieceRef && isEventNodeRef(selectedPieceRef);
  // Highlight left modes
  if (ui.modeIsland) {
    if (toolMode === 'island') ui.modeIsland.classList.add('active');
    else ui.modeIsland.classList.remove('active');
  }
  if (ui.modeDoodad) {
    if (toolMode === 'doodad') ui.modeDoodad.classList.add('active');
    else ui.modeDoodad.classList.remove('active');
  }
  if (ui.modeEvent) {
    if (toolMode === 'event') ui.modeEvent.classList.add('active');
    else ui.modeEvent.classList.remove('active');
  }
  if (ui.modeSelect) {
    if (toolMode === 'select') ui.modeSelect.classList.add('active');
    else ui.modeSelect.classList.remove('active');
  }

  // Toggle middle sub-toolbars visibility
  if (ui.middleIslandDoodad) ui.middleIslandDoodad.style.display = (toolMode === 'island' || toolMode === 'doodad') ? 'flex' : 'none';
  if (ui.middleEvent) ui.middleEvent.style.display = (toolMode === 'event') ? 'flex' : 'none';
  if (ui.middleSelect) ui.middleSelect.style.display = (toolMode === 'select') ? 'flex' : 'none';

  // Update global buttons status
  if (ui.btnPan) {
    if (isPanActive) ui.btnPan.classList.add('active');
    else ui.btnPan.classList.remove('active');
  }
  if (ui.btnSnapToggle) {
    if (State.data.moveSnapEnabled) ui.btnSnapToggle.classList.add('active');
    else ui.btnSnapToggle.classList.remove('active');
  }
  if (ui.btnMapOnly) {
    if (State.data.isMapOnly) ui.btnMapOnly.classList.add('active');
    else ui.btnMapOnly.classList.remove('active');
  }

  // Island/Doodad 子工具：仅在对应主模式且非 Pan 时高亮；始终刷新，避免切模式后残留 active
  {
    const drawGroupOn = (toolMode === 'island' || toolMode === 'doodad') && !isPanActive;
    const setDrawActive = (btn: HTMLButtonElement | null, on: boolean) => {
      if (!btn) return;
      btn.disabled = false;
      if (on) btn.classList.add('active');
      else btn.classList.remove('active');
    };
    setDrawActive(ui.btnAdd, drawGroupOn && drawSubMode === 'add');
    setDrawActive(ui.btnMove, drawGroupOn && drawSubMode === 'move');
    setDrawActive(ui.btnFlip, drawGroupOn && drawSubMode === 'flip');
    setDrawActive(ui.btnRotation, drawGroupOn && drawSubMode === 'rotation');
    setDrawActive(ui.btnDelete, drawGroupOn && drawSubMode === 'delete');

    if (ui.btnCurLayer) {
      const layerOn = toolMode === 'island' || toolMode === 'doodad';
      ui.btnCurLayer.disabled = !layerOn;
      ui.btnCurLayer.textContent = 'CurLayer';
      ui.btnCurLayer.title = `默认绘制层: ${defaultDrawLayer}（激活：隐藏覆盖层 + 按层过滤 mapPiece；关闭：全部显示）`;
      if (layerOn && isCurLayerActive) ui.btnCurLayer.classList.add('active');
      else ui.btnCurLayer.classList.remove('active');
    }
    if (ui.btnLayerDec) {
      ui.btnLayerDec.disabled = !(toolMode === 'island' || toolMode === 'doodad') || !isCurLayerActive;
      ui.btnLayerDec.classList.remove('active');
    }
    if (ui.btnLayerInc) {
      ui.btnLayerInc.disabled = !(toolMode === 'island' || toolMode === 'doodad') || !isCurLayerActive;
      ui.btnLayerInc.classList.remove('active');
    }
  }

  // Event 子工具：仅在 event 主模式且非 Pan 时高亮
  {
    const eventGroupOn = toolMode === 'event' && !isPanActive;
    if (ui.btnEventType) {
      ui.btnEventType.textContent = `Type: ${pendingEventType.toUpperCase()}`;
    }
    if (ui.btnEventAdd) {
      if (eventGroupOn && eventSubMode === 'add') ui.btnEventAdd.classList.add('active');
      else ui.btnEventAdd.classList.remove('active');
    }
    if (ui.btnEventMove) {
      if (eventGroupOn && eventSubMode === 'move') ui.btnEventMove.classList.add('active');
      else ui.btnEventMove.classList.remove('active');
    }
    if (ui.btnEventEdit) {
      if (eventGroupOn && eventSubMode === 'edit') ui.btnEventEdit.classList.add('active');
      else ui.btnEventEdit.classList.remove('active');
      ui.btnEventEdit.disabled = false;
    }
    if (ui.btnEventDelete) {
      if (eventGroupOn && eventSubMode === 'delete') ui.btnEventDelete.classList.add('active');
      else ui.btnEventDelete.classList.remove('active');
      ui.btnEventDelete.disabled = false;
    }
    // Append 在 select 中间栏；有选中事件节点时可点
    if (ui.btnAppend) ui.btnAppend.disabled = !isEventNode;
  }

  // Select 中间栏
  if (ui.btnSelectDelete) {
    ui.btnSelectDelete.disabled = toolMode !== 'select' || !hasSelection;
  }

  // Add CSS classes for active editing states
  DOM.viewport.classList.remove(
      'edit-mode-active', 'edit-mode-island', 'edit-mode-doodad',
      'edit-mode-event', 'edit-mode-select', 'cur-layer-active'
  );
  if (toolMode === 'island') {
    DOM.viewport.classList.add('edit-mode-island');
  } else if (toolMode === 'doodad') {
    DOM.viewport.classList.add('edit-mode-doodad');
  } else if (toolMode === 'event') {
    DOM.viewport.classList.add('edit-mode-event');
  } else if (toolMode === 'select') {
    DOM.viewport.classList.add('edit-mode-select');
  }
  if (!isPanActive) {
    DOM.viewport.classList.add('edit-mode-active');
  }
  if (isCurLayerActive) {
    DOM.viewport.classList.add('cur-layer-active');
  }
  applyDrawLayerFilter();
}
