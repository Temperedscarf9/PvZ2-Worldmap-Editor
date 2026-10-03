import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState } from '../editor/EditorState';
import { getSelectedNode, isDoodadRef, isMapPieceRef } from '../editor/types';

/** Lightweight selection readout on the metadata bar. */
export function updateInspector(): void {
  const bar = DOM.uiElements.metaBar;
  if (!bar) return;

  const selectedPieceRef = EditorState.selectedPieceRef;
  if (!selectedPieceRef) {
    bar.textContent = `WORLD: ${State.data.selectedWorld || 'NONE'}`;
    return;
  }

  const node = getSelectedNode(selectedPieceRef);
  if (!node) {
    bar.textContent = `WORLD: ${State.data.selectedWorld || 'NONE'}`;
    return;
  }

  const name = node.m_name || node.m_eventType || 'Unnamed';
  const type = isMapPieceRef(selectedPieceRef)
    ? 'island'
    : isDoodadRef(selectedPieceRef)
      ? 'doodad'
      : 'event';
  const x = Math.round(node.m_position?.x || 0);
  const y = Math.round(node.m_position?.y || 0);
  const layer = node.m_drawLayer ?? '—';
  bar.textContent = `${type}: ${name} | X:${x} Y:${y} | layer:${layer}`;
}

export function populateWorldSelector(): void {
  const select = DOM.uiElements.selectWorld;
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = State.data.availableWorlds.length
    ? `-- Select World (${State.data.availableWorlds.length}) --`
    : '-- No worlds found --';
  select.appendChild(placeholder);

  State.data.availableWorlds.forEach((world) => {
    const opt = document.createElement('option');
    opt.value = world;
    opt.textContent = world.toUpperCase();
    select.appendChild(opt);
  });

  select.disabled = State.data.availableWorlds.length === 0;

  if (State.data.availableWorlds.includes(previousValue)) {
    select.value = previousValue;
  } else {
    select.value = '';
  }
}

/** Kept as no-ops for call sites after shop removal. */
export function refreshItemShop(): void {}
export function bindItemShopTabs(): void {}
