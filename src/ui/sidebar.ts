import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState } from '../editor/EditorState';
import { getSelectedNode, isDoodadRef, isMapPieceRef } from '../editor/types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtFloat(n: unknown): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(6);
}

function fmtBool(v: unknown): string {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return '—';
}

function fmtVal(v: unknown): string {
  if (v == null || v === '') return '—';
  return esc(String(v));
}

function row(label: string, value: string): string {
  return `<div class="sel-row"><span class="sel-key">${label}</span><span class="sel-val">${value}</span></div>`;
}

function renderIslandOrDoodad(node: any, kind: 'island' | 'doodad'): string {
  const x = node.m_position?.x;
  const y = node.m_position?.y;
  return [
    `<div class="sel-kind">${kind}</div>`,
    row('m_imageID', fmtVal(node.m_imageID)),
    row('m_position.x', fmtFloat(x)),
    row('m_position.y', fmtFloat(y)),
    row('m_drawLayer', fmtVal(node.m_drawLayer)),
    row('m_parallaxLayer', fmtVal(node.m_parallaxLayer)),
    row('m_isArtFlipped', fmtBool(node.m_isArtFlipped)),
    row('m_rotationAngle', fmtFloat(node.m_rotationAngle)),
    row('m_scaleX', fmtFloat(node.m_scaleX)),
    row('m_scaleY', fmtFloat(node.m_scaleY)),
    row('m_name', fmtVal(node.m_name)),
  ].join('');
}

function renderEvent(node: any): string {
  const x = node.m_position?.x;
  const y = node.m_position?.y;
  return [
    `<div class="sel-kind">event</div>`,
    row('m_eventType', fmtVal(node.m_eventType)),
    row('m_name', fmtVal(node.m_name)),
    row('m_position.x', fmtFloat(x)),
    row('m_position.y', fmtFloat(y)),
    row('m_dataString', fmtVal(node.m_dataString)),
    row('m_parentEvent', fmtVal(node.m_parentEvent)),
    row('m_unlockedFrom', fmtVal(node.m_unlockedFrom)),
  ].join('');
}

/**
 * Read-only selection readout in the right panel.
 * Field set follows the left tool mode (island / doodad vs event), not only the node type.
 */
export function updateInspector(): void {
  const bar = DOM.uiElements.metaBar;
  if (!bar) return;

  const selectedPieceRef = EditorState.selectedPieceRef;
  if (!selectedPieceRef) {
    bar.innerHTML = `<div class="selection-empty">在地图上点击节点以查看属性</div>`;
    return;
  }

  const node = getSelectedNode(selectedPieceRef);
  if (!node) {
    bar.innerHTML = `<div class="selection-empty">在地图上点击节点以查看属性</div>`;
    return;
  }

  const mode = EditorState.toolMode;

  if (mode === 'island' || mode === 'doodad') {
    // Island / doodad modes: piece properties (image, layer, flip, …)
    const kind: 'island' | 'doodad' =
      mode === 'doodad' || isDoodadRef(selectedPieceRef)
        ? 'doodad'
        : isMapPieceRef(selectedPieceRef)
          ? 'island'
          : 'island';
    bar.innerHTML = renderIslandOrDoodad(node, kind);
    return;
  }

  if (mode === 'event') {
    bar.innerHTML = renderEvent(node);
    return;
  }

  // Select mode: show based on what was clicked
  if (isMapPieceRef(selectedPieceRef) || isDoodadRef(selectedPieceRef)) {
    bar.innerHTML = renderIslandOrDoodad(
      node,
      isDoodadRef(selectedPieceRef) ? 'doodad' : 'island'
    );
  } else {
    bar.innerHTML = renderEvent(node);
  }
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
