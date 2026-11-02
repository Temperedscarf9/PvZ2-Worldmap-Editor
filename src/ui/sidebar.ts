import { State } from '../core/state';
import { DOM } from '../app/dom';
import { EditorState, EVENT_TYPE_CYCLE } from '../editor/EditorState';
import {
  getSelectedNode,
  isDoodadRef,
  isEventNodeRef,
} from '../editor/types';
import { openEventEditorModal } from '../editor/EventPropertyEditor';
import { applyTransformOnly, refreshSingleObject } from '../editor/ObjectMount';
import { HistoryManager } from '../editor/HistoryManager';
import { finalizeDragPathUpdate } from '../editor/commands/MoveCommand';
import { invalidateEventResourceCacheForNode } from '../events/resolveEventResources';
import { getPlantDropdownOptionsForWorld } from '../core/resources/plantTypes';
import { updateToolbarState } from './toolbar';
import { updateSelectionFrame } from './selectionFrame';

type NodeKind = 'island' | 'doodad' | 'event';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n: unknown, digits = 6): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  // Always show fixed decimal places so the inspector matches authoring precision.
  return n.toFixed(digits);
}

/** Round to `digits` decimal places without turning the value into a string. */
function roundTo(n: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function fmtVal(v: unknown): string {
  if (v == null || v === '') return '—';
  return esc(String(v));
}

function kindOf(node: any, ref: any): NodeKind {
  if (isEventNodeRef(ref)) {
    return String(node?.m_eventType || '') === 'doodad' ? 'doodad' : 'event';
  }
  return isDoodadRef(ref) ? 'doodad' : 'island';
}

function kv(label: string, value: string): string {
  return `<div class="kv"><span>${label}</span><b title="${value}">${value}</b></div>`;
}

function objectCard(node: any, kind: NodeKind): string {
  const isEvent = kind === 'event';
  const typeLabel = isEvent ? String(node.m_eventType || 'event') : kind;
  const name =
    node.m_name ||
    (isEvent
      ? `${typeLabel} #${node.m_eventId ?? '—'}`
      : `imageID ${node.m_imageID ?? '—'}`);
  const sub = isEvent
    ? `eventId ${node.m_eventId ?? '—'}`
    : `image ${node.m_imageID ?? '—'} · layer ${node.m_drawLayer ?? 0}`;

  const fields: string[] = [];
  if (isEvent) {
    fields.push(kv('eventType', fmtVal(node.m_eventType)));
    fields.push(kv('eventId', fmtVal(node.m_eventId)));
    fields.push(kv('position', `${fmtNum(node.m_position?.x)}, ${fmtNum(node.m_position?.y)}`));
    fields.push(kv('parent', fmtVal(node.m_parentEvent)));
    fields.push(kv('data', fmtVal(node.m_dataString)));
    fields.push(kv('unlocked', fmtVal(node.m_unlockedFrom)));
  } else {
    fields.push(kv('imageID', fmtVal(node.m_imageID)));
    fields.push(kv('position', `${fmtNum(node.m_position?.x)}, ${fmtNum(node.m_position?.y)}`));
    fields.push(kv('drawLayer', fmtVal(node.m_drawLayer)));
    fields.push(kv('parallax', fmtVal(node.m_parallaxLayer)));
    fields.push(kv('rotation', `${fmtNum(node.m_rotationAngle)}°`));
    fields.push(kv('scale', `${fmtNum(node.m_scaleX)}, ${fmtNum(node.m_scaleY)}`));
  }

  return `
    <div class="object-card" data-kind="${kind}">
      <div class="object-head">
        <span class="type-badge ${kind}">${esc(typeLabel.toUpperCase())}</span>
        <span class="object-name" title="${esc(name)}">${esc(name)}</span>
      </div>
      <div class="object-sub">${esc(sub)}</div>
      ${isEvent ? '' : `<div class="kv-grid">${fields.join('')}</div>`}
      <div class="object-actions">
        <button class="btn btn-ghost" data-inspector-action="focus">定位到对象</button>
      </div>
    </div>`;
}

function inputField(
  label: string,
  field: string,
  value: number | string,
  opts: { step?: number | string; type?: string; small?: boolean; digits?: number } = {}
): string {
  const type = opts.type || 'number';
  const step = opts.step != null ? ` step="${opts.step}"` : '';
  let display: string;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const digits = opts.digits ?? 6;
    display = value.toFixed(digits);
  } else {
    display = String(value ?? '');
  }
  return `<div class="field">
    <label>${esc(label)}</label>
    <input class="input${opts.small ? ' small' : ''}" type="${type}" data-transform-field="${field}" value="${esc(display)}"${step} />
  </div>`;
}

function eventInput(
  label: string,
  field: string,
  value: unknown,
  opts: { type?: string; options?: string[]; wide?: boolean } = {}
): string {
  const type = opts.type || 'text';
  const wide = opts.wide ? ' input-wide' : '';
  if (opts.options) {
    const options = opts.options
      .map((v) => `<option value="${esc(v)}" ${String(value) === v ? 'selected' : ''}>${esc(v)}</option>`)
      .join('');
    return `<div class="field${wide}">
      <label>${esc(label)}</label>
      <select class="input" data-event-field="${field}">${options}</select>
    </div>`;
  }
  return `<div class="field${wide}">
    <label>${esc(label)}</label>
    <input class="input" type="${type}" data-event-field="${field}" value="${esc(String(value ?? ''))}" />
  </div>`;
}

function eventSwitch(label: string, field: string, checked: boolean): string {
  return `<label class="switch-row" style="padding:5px 0;">
    <span>${esc(label)}</span>
    <input type="checkbox" data-event-field="${field}" ${checked ? 'checked' : ''} />
    <i class="switch"></i>
  </label>`;
}

function eventPlantInput(value: unknown): string {
  return `<div class="field input-wide">
    <label>Plant Name</label>
    <div class="plant-combo">
      <input class="input" type="text" data-event-field="m_dataString" value="${esc(String(value ?? ''))}" autocomplete="off" />
      <button type="button" class="plant-toggle" title="选择植物">▾</button>
      <div class="plant-dropdown" aria-hidden="true"></div>
    </div>
  </div>`;
}

function renderEventProperties(node: any): string {
  const type = String(node.m_eventType || 'level');
  const dataLabel =
    type === 'level' ? 'Level File'
      : type === 'plant' || type === 'plantbox' ? 'Plant Name'
        : type === 'upgrade' ? 'Upgrade Name'
          : 'Data String';
  const isGate = type === 'key_gate' || type === 'star_gate';
  const isLevel = type === 'level';
  const isPlant = type === 'plant' || type === 'plantbox';
  const types = EVENT_TYPE_CYCLE.includes(type) ? EVENT_TYPE_CYCLE : [...EVENT_TYPE_CYCLE, type];

  return `
    <div class="section-title spaced"><span>事件属性</span></div>
    <div class="transform-grid">
      ${eventInput('Event Name', 'm_name', node.m_name ?? '', { wide: true })}
      ${eventInput('Event Type', 'm_eventType', type, { options: types, wide: true })}
      ${eventInput('Event ID', 'm_eventId', node.m_eventId ?? 0, { type: 'number' })}
      ${isGate ? eventInput('Cost', 'm_cost', node.m_cost ?? 0, { type: 'number' }) : ''}
      ${isPlant ? eventPlantInput(node.m_dataString) : eventInput(dataLabel, 'm_dataString', node.m_dataString ?? '', { wide: true })}
      ${eventInput('Display Text', 'm_displayText', node.m_displayText ?? '', { wide: true })}
      ${isLevel ? eventInput('Level Type', 'm_levelNodeType', node.m_levelNodeType ?? 'normal', {
        options: ['normal', 'minigame', 'miniboss', 'nonfinalboss', 'boss', 'danger'],
        wide: true,
      }) : ''}
      ${isLevel ? eventInput('World Map Tutorial', 'm_worldMapTutorial', node.m_worldMapTutorial ?? '', { wide: true }) : ''}
      ${isLevel ? eventInput('Tutorial When', 'm_worldMapTutorialVisibleWhen', node.m_worldMapTutorialVisibleWhen ?? '', { wide: true }) : ''}
      ${isLevel ? eventInput('Toggle Name', 'm_toggleName', node.m_toggleName ?? '', { wide: true }) : ''}
      ${eventInput('Parent Event', 'm_parentEvent', node.m_parentEvent ?? '', { wide: true })}
      ${eventInput('Unlocked From', 'm_unlockedFrom', node.m_unlockedFrom ?? '', { wide: true })}
      ${eventInput('Visible From', 'm_visibleFrom', node.m_visibleFrom ?? '', { wide: true })}
    </div>
    ${eventSwitch('Auto Visible', 'm_autoVisible', !!node.m_autoVisible)}
    ${eventSwitch('Timed Event', 'm_isTimedEvent', !!node.m_isTimedEvent)}
    ${eventSwitch('Art Flipped', 'm_isArtFlipped', !!node.m_isArtFlipped)}
    ${eventSwitch('Challenge Type', 'm_isChallengeType', !!node.m_isChallengeType)}
    <button class="btn btn-ghost event-advanced" data-event-action="advanced">高级属性…</button>`;
}

function bindPlantDropdown(host: HTMLElement, node: any): void {
  const combo = host.querySelector<HTMLElement>('.plant-combo');
  if (!combo) return;
  const input = combo.querySelector<HTMLInputElement>('input[data-event-field="m_dataString"]');
  const toggle = combo.querySelector<HTMLButtonElement>('.plant-toggle');
  const dropdown = combo.querySelector<HTMLElement>('.plant-dropdown');
  if (!input || !toggle || !dropdown) return;

  const { options, homeSet } = getPlantDropdownOptionsForWorld(State.data.selectedWorld || '');
  dropdown.innerHTML = '';
  for (const opt of options) {
    opt.starEl.style.display = homeSet.has(opt.name) ? '' : 'none';
    opt.el.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = opt.name;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    dropdown.appendChild(opt.el);
  }
  if (options.length === 0) {
    dropdown.textContent = '未加载 PlantTypes';
  }

  let open = false;
  const close = () => {
    open = false;
    dropdown.classList.remove('is-open');
    dropdown.setAttribute('aria-hidden', 'true');
    toggle.classList.remove('is-open');
    document.removeEventListener('mousedown', onDocDown, true);
  };
  const onDocDown = (e: MouseEvent) => {
    if (!combo.contains(e.target as Node)) close();
  };
  const render = (filter: string) => {
    const q = filter.trim().toLowerCase();
    for (const opt of options) {
      opt.el.style.display = !q || opt.name.toLowerCase().includes(q) ? '' : 'none';
    }
  };
  const openDropdown = () => {
    if (open) return;
    open = true;
    render(input.value);
    dropdown.classList.add('is-open');
    dropdown.setAttribute('aria-hidden', 'false');
    toggle.classList.add('is-open');
    document.addEventListener('mousedown', onDocDown, true);
  };

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) close(); else openDropdown();
  });
  input.addEventListener('focus', openDropdown);
  input.addEventListener('input', () => {
    if (!open) openDropdown();
    render(input.value);
  });
}


function bindEventProperties(node: any): void {
  const host = document.getElementById('event-properties');
  if (!host) return;

  const commit = async (input: HTMLInputElement | HTMLSelectElement) => {
    const field = input.dataset.eventField;
    if (!field) return;

    let value: any = input instanceof HTMLInputElement && input.type === 'checkbox'
      ? input.checked
      : input.value;
    if (field === 'm_eventId' || field === 'm_cost') {
      value = Number(value);
      if (!Number.isFinite(value)) return;
    }

    const oldId = node.m_eventId;
    HistoryManager.recordBefore('编辑事件属性');
    node[field] = value;
    try {
      if (field === 'm_eventId') invalidateEventResourceCacheForNode(oldId);
      if (node.m_eventId != null) invalidateEventResourceCacheForNode(node.m_eventId);
      await refreshSingleObject(node, 'reload');
    } catch (err) {
      console.warn('[EventProperties] reload failed', err);
    } finally {
      HistoryManager.endGesture();
    }
    updateToolbarState();
    updateInspector();
    updateSelectionFrame();
  };

  host.querySelectorAll<HTMLElement>('[data-event-field]').forEach((input) => {
    input.addEventListener('focus', () => HistoryManager.recordBefore('编辑事件属性'));
    input.addEventListener('change', () => void commit(input as HTMLInputElement));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input instanceof HTMLInputElement) {
        e.preventDefault();
        input.blur();
      }
    });
  });

  bindPlantDropdown(host, node);

  host.querySelector<HTMLElement>('[data-event-action="advanced"]')?.addEventListener('click', () => {
    openEventEditorModal(node);
  });
}


function renderTransformPanel(node: any, kind: NodeKind): string {
  const isEvent = kind === 'event';
  const x = typeof node.m_position?.x === 'number' ? node.m_position.x : 0;
  const y = typeof node.m_position?.y === 'number' ? node.m_position.y : 0;
  const rot = typeof node.m_rotationAngle === 'number' ? node.m_rotationAngle : 0;
  const sx = typeof node.m_scaleX === 'number' ? node.m_scaleX : 1;
  const sy = typeof node.m_scaleY === 'number' ? node.m_scaleY : 1;
  const layer = typeof node.m_drawLayer === 'number' ? node.m_drawLayer : 0;
  const pl = typeof node.m_parallaxLayer === 'number' ? node.m_parallaxLayer : 0;
  const imageId = typeof node.m_imageID === 'number' ? node.m_imageID : 0;

  const fields = [
    inputField('Position X', 'x', x, { step: 'any', digits: 6 }),
    inputField('Position Y', 'y', y, { step: 'any', digits: 6 }),
    inputField('Rotation °', 'rotation', rot, { step: 'any', digits: 6 }),
    inputField('Draw layer', 'drawLayer', layer, { step: 1, digits: 0 }),
    inputField('Scale X', 'scaleX', sx, { step: 'any', digits: 6 }),
    inputField('Scale Y', 'scaleY', sy, { step: 'any', digits: 6 }),
  ];

  if (!isEvent) {
    fields.push(inputField('Parallax', 'parallaxLayer', pl, { step: 1, digits: 0 }));
    fields.push(inputField('imageID', 'imageID', imageId, { step: 1, digits: 0 }));
  }

  const flip = !isEvent
    ? `<label class="switch-row" style="padding:4px 0 0;">
         <span>水平翻转</span>
         <input type="checkbox" data-transform-field="flip" ${node.m_isArtFlipped ? 'checked' : ''} />
         <i class="switch"></i>
       </label>`
    : '';

  return `
    <div class="transform-grid">${fields.join('')}</div>
    ${flip}
    <div class="transform-actions">
      <button class="btn btn-ghost" data-transform-action="round">取整</button>
      <button class="btn btn-ghost" data-transform-action="reset-scale">重置缩放</button>
    </div>`;
}

function bindInspectorActions(node: any, kind: NodeKind): void {
  const bar = DOM.uiElements.metaBar;
  if (bar) {
    bar.querySelectorAll<HTMLElement>('[data-inspector-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.inspectorAction;
        if (action === 'edit-event' && kind === 'event') {
          openEventEditorModal(node);
        } else if (action === 'focus') {
          // Center camera on this node without selecting it again.
          const res = State.data.textureResolution;
          const wx = ((node.m_position?.x ?? 0) * res) / 600;
          const wy = ((node.m_position?.y ?? 0) * res) / 600;
          const rect = DOM.viewport.getBoundingClientRect();
          EditorState.targetCamera.x = rect.width / 2 / State.camera.scale - wx;
          EditorState.targetCamera.y = rect.height / 2 / State.camera.scale - wy;
        }
      });
    });
  }

  const panel = document.getElementById('transform-panel');
  if (!panel) return;

  const commit = async (field: string, input: HTMLInputElement) => {
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    try {
      HistoryManager.recordBefore('编辑对象属性');
      if (field === 'x' || field === 'y') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        node.m_position = node.m_position || { x: 0, y: 0 };
        // Keep 6 decimal places so inspector display matches editor math precision.
        node.m_position[field] = roundTo(n, 6);
        applyTransformOnly(node);
        try { finalizeDragPathUpdate(); } catch { /* optional */ }
      } else if (field === 'rotation') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        node.m_rotationAngle = roundTo(((n % 360) + 360) % 360, 6);
        applyTransformOnly(node);
      } else if (field === 'scaleX' || field === 'scaleY') {
        const n = Number(raw);
        if (!Number.isFinite(n) || n === 0) return;
        node[field === 'scaleX' ? 'm_scaleX' : 'm_scaleY'] = roundTo(n, 6);
        applyTransformOnly(node);
      } else if (field === 'flip') {
        node.m_isArtFlipped = !!raw;
        applyTransformOnly(node);
      } else if (field === 'drawLayer' || field === 'parallaxLayer') {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n)) return;
        node[field === 'drawLayer' ? 'm_drawLayer' : 'm_parallaxLayer'] = n;
        await refreshSingleObject(node, 'reload');
        updateInspector();
      } else if (field === 'imageID') {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n < 0) return;
        node.m_imageID = n;
        if (kind === 'island') EditorState.defaultImageID = n;
        await refreshSingleObject(node, 'reload');
        updateInspector();
      }
    } finally {
      HistoryManager.endGesture();
      updateToolbarState();
      window.dispatchEvent(new CustomEvent('studio:selection-updated'));
    }
  };

  panel.querySelectorAll<HTMLInputElement>('[data-transform-field]').forEach((input) => {
    const field = input.dataset.transformField!;
    input.addEventListener('focus', () => HistoryManager.recordBefore('编辑对象属性'));
    input.addEventListener('change', () => void commit(field, input));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
  });

  panel.querySelectorAll<HTMLElement>('[data-transform-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.transformAction;
      if (action === 'round') {
        HistoryManager.recordBefore('坐标取整');
        node.m_position = node.m_position || { x: 0, y: 0 };
        node.m_position.x = Math.round(node.m_position.x || 0);
        node.m_position.y = Math.round(node.m_position.y || 0);
        applyTransformOnly(node);
        try { finalizeDragPathUpdate(); } catch { /* optional */ }
        HistoryManager.endGesture();
        updateInspector();
      } else if (action === 'reset-scale') {
        HistoryManager.recordBefore('重置缩放');
        node.m_scaleX = 1;
        node.m_scaleY = 1;
        applyTransformOnly(node);
        HistoryManager.endGesture();
        updateInspector();
      }
    });
  });
}

/**
 * Selection readout in the left drawer. The field set follows the active tool mode
 * (island / doodad vs event), not only the node type.
 */
export function updateInspector(): void {
  const bar = DOM.uiElements.metaBar;
  if (!bar) return;

  const ref = EditorState.selectedPieceRef;
  const node = ref ? getSelectedNode(ref) : null;
  const kindEl = document.getElementById('selection-kind');
  const panel = document.getElementById('transform-panel');
  const eventHost = document.getElementById('event-properties');

  if (!ref || !node) {
    bar.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">◇</div>
        <p>在地图上点击节点</p>
        <span>查看并编辑它的属性</span>
      </div>`;
    if (panel) panel.innerHTML = `<div class="empty-inline">未选中对象</div>`;
    if (eventHost) eventHost.innerHTML = '';
    if (kindEl) kindEl.textContent = '—';
    window.dispatchEvent(new CustomEvent('studio:selection-updated'));
    return;
  }

  const mode = EditorState.toolMode;
  let kind: NodeKind;
  if (mode === 'event') {
    kind = 'event';
  } else if (isEventNodeRef(ref)) {
    // A selected event/doodad must keep event fields even while the island tool is active.
    kind = isDoodadRef(ref) ? 'doodad' : 'event';
  } else if (mode === 'island' || mode === 'doodad') {
    kind = mode === 'doodad' ? 'doodad' : 'island';
  } else {
    kind = kindOf(node, ref);
  }

  bar.innerHTML = objectCard(node, kind);
  if (panel) panel.innerHTML = renderTransformPanel(node, kind);
  if (eventHost) {
    if (kind === 'event' || kind === 'doodad') {
      eventHost.innerHTML = renderEventProperties(node);
      bindEventProperties(node);
    } else {
      eventHost.innerHTML = '';
    }
  }
  if (kindEl) kindEl.textContent = kind === 'event' ? 'EVENT' : kind === 'doodad' ? 'DOODAD' : 'ISLAND';

  bindInspectorActions(node, kind);
  window.dispatchEvent(new CustomEvent('studio:selection-updated'));
}

export function populateWorldSelector(): void {
  const select = DOM.uiElements.selectWorld;
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = State.data.availableWorlds.length
    ? `-- 选择世界 (${State.data.availableWorlds.length}) --`
    : '-- 未找到世界 --';
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
  } else if (State.data.selectedWorld && State.data.availableWorlds.includes(State.data.selectedWorld)) {
    select.value = State.data.selectedWorld;
  } else {
    select.value = '';
  }

  window.dispatchEvent(new CustomEvent('studio:worlds-updated'));
}

/** Kept as no-ops for call sites after shop removal. */
export function refreshItemShop(): void {}
export function bindItemShopTabs(): void {}
