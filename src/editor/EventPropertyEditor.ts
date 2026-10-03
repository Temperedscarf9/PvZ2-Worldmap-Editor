import { State } from '../core/state';
import { PathFactory } from '../scene/factories/PathFactory';
import { invalidateEventResourceCacheForNode } from '../events/resolveEventResources';
import { getPlantDropdownOptionsForWorld } from '../core/resources/plantTypes';
import { refreshSingleObject } from './ObjectMount';
import { selectPiece } from './Selection';
import { requestTighterFrameBudget, requestNormalFrameBudget } from './EditorState';

type EventEditorRow = { label: string | null; key?: string };

/** Scalar keys the property editor is allowed to read/write. Position is never edited here. */
const EDITABLE_KEYS = [
  'm_name',
  'm_eventType',
  'm_dataString',
  'm_cost',
  'm_displayText',
  'm_unlockedNarrationID',
  'm_completedNarrationID',
  'm_parentEvent',
  'm_unlockedFrom',
  'm_visibleFrom',
  'm_autoVisible',
  'm_isTimedEvent',
  'm_isArtFlipped',
  'm_isChallengeType',
  'm_levelNodeType',
] as const;

const VISUAL_KEYS = [
  'm_eventType',
  'm_dataString',
  'm_displayText',
  'm_cost',
  'm_isArtFlipped',
  'm_isChallengeType',
  'm_levelNodeType',
] as const;

const PATH_KEYS = ['m_parentEvent'] as const;

/** Rows shared by every event-type's editor panel (everything after the type-specific slot). */
const EVENT_EDITOR_COMMON_ROWS: EventEditorRow[] = [
  { label: 'Display Text', key: 'm_displayText' },
  { label: 'Unlocked Narr ID', key: 'm_unlockedNarrationID' },
  { label: 'Completed Narr ID', key: 'm_completedNarrationID' },
  { label: 'Parent Event', key: 'm_parentEvent' },
  { label: 'Unlock From', key: 'm_unlockedFrom' },
  { label: 'Visible From', key: 'm_visibleFrom' },
  { label: 'Auto-Visible', key: 'm_autoVisible' },
  { label: null },
  { label: 'Is Timed Event', key: 'm_isTimedEvent' },
  { label: 'Is Art Flipped', key: 'm_isArtFlipped' },
  { label: 'Is Challenge Type', key: 'm_isChallengeType' },
];

/** Rows 3–4 (right after Event Name / Event Type) are the only part that varies by event type. */
const EVENT_EDITOR_TYPE_ROWS: Record<string, EventEditorRow[]> = {
  level: [{ label: 'Level File', key: 'm_dataString' }, { label: null }],
  plant: [{ label: 'Plant Name', key: 'm_dataString' }, { label: null }],
  plantbox: [{ label: 'Plant Name', key: 'm_dataString' }, { label: null }],
  upgrade: [{ label: 'Upgrade Name', key: 'm_dataString' }, { label: null }],
  key_gate: [{ label: null }, { label: 'Cost', key: 'm_cost' }],
};
const EVENT_EDITOR_DEFAULT_TYPE_ROWS: EventEditorRow[] = [{ label: null }, { label: null }];

// NOTE: currently unused by openEventEditorModal below, which grew its own inline
// getTypeRows()/COMMON_ROWS with live event-type switching (including a `star_gate` cost row
// this table doesn't have). Kept as-is during the module split; flag if you'd like it removed
// or reconciled with the modal's own copy.
export function buildEventEditorSchema(eventType: string): EventEditorRow[] {
  const typeRows = EVENT_EDITOR_TYPE_ROWS[eventType] || EVENT_EDITOR_DEFAULT_TYPE_ROWS;
  return [
    { label: 'Event Name', key: 'm_name' },
    { label: 'Event Type', key: 'm_eventType' },
    ...typeRows,
    ...EVENT_EDITOR_COMMON_ROWS,
  ];
}

/**
 * Event Property Editor: all form interactions mutate a **draft** only.
 * The live map node is left untouched until the user clicks "Save changes".
 * Cancel discards the draft; Save copies draft → node and refreshes visuals if needed.
 */
export function openEventEditorModal(node: any): void {
  const existing = document.querySelector('.event-editor-overlay');
  if (existing) {
    existing.remove();
    requestNormalFrameBudget(); // release whatever budget request the replaced instance held
  }
  requestTighterFrameBudget(); // more of each frame goes to this modal's own input handling
  // while it's open; paired release on every close path below.

  // Snapshot of original values for dirty detection / cancel (never mutate `node` while open).
  const original: Record<string, any> = {};
  for (const k of EDITABLE_KEYS) {
    if (k in node) original[k] = node[k];
  }

  // Working copy — every input binds to this, not the live node.
  const draft: Record<string, any> = { ...original };

  function getValidEventTypes(): string[] {
    const always = ['level', 'plant', 'upgrade', 'doodad', 'giftbox'];
    if (State.data.isLinear) {
      return [...always, 'pinata'];
    } else {
      return [...always, 'plantbox', 'star_gate', 'key_gate', 'path_node'];
    }
  }

  function getTypeRows(eventType: string): Array<{ label: string | null; key?: string }> {
    switch (eventType) {
      case 'level':
        return [{ label: 'Level File', key: 'm_dataString' }, { label: null }];
      case 'plant':
      case 'plantbox':
        return [{ label: 'Plant Name', key: 'm_dataString' }, { label: null }];
      case 'upgrade':
        return [{ label: 'Upgrade Name', key: 'm_dataString' }, { label: null }];
      case 'key_gate':
        return [{ label: null }, { label: 'Cost', key: 'm_cost' }];
      case 'star_gate':
        return [{ label: null }, { label: 'Cost', key: 'm_cost' }];
      default:
        return [{ label: null }, { label: null }];
    }
  }

  /**
   * Custom plant picker: ALL TypeNames from PlantTypes.json are listed and selectable.
   * Entries whose HomeWorld equals the current selected world show a small ★ on the
   * right edge of the same clickable row (not a separate column/area).
   * Free-typed values are still allowed via the text input.
   * Writes only go into `draft` via onPick / input handlers — never the live node.
   */
  function buildPlantDropdown(
      inputEl: HTMLInputElement,
      hostRow: HTMLElement,
      onPick: (typeName: string) => void
  ): void {
    hostRow.querySelectorAll('.event-editor-plant-combo').forEach((el) => el.remove());

    // buildPlantDropdown re-runs every time this row becomes a plant/plantbox field again
    // (each Event Type toggle), but inputEl is reused, not recreated - so any listeners bound
    // directly to it must be torn down first, or they stack up. Each stacked 'input' listener
    // re-runs renderOptions() on every keystroke, which after just a handful of toggles turns
    // one keystroke into a multi-second freeze.
    const prevHandlers = (inputEl as any)._plantDropdownHandlers as
        { focus: () => void; input: () => void; onDocDown: (e: MouseEvent) => void } | undefined;
    if (prevHandlers) {
      inputEl.removeEventListener('focus', prevHandlers.focus);
      inputEl.removeEventListener('input', prevHandlers.input);
      document.removeEventListener('mousedown', prevHandlers.onDocDown, true);
      delete (inputEl as any)._plantDropdownHandlers;
    }

    const combo = document.createElement('div');
    combo.className = 'event-editor-plant-combo';

    inputEl.classList.add('event-editor-plant-input');
    const parent = inputEl.parentElement;
    if (parent) parent.insertBefore(combo, inputEl);
    combo.appendChild(inputEl);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'event-editor-plant-toggle';
    toggleBtn.title = '选择植物';
    toggleBtn.textContent = '▾';
    combo.appendChild(toggleBtn);

    const dropdown = document.createElement('div');
    dropdown.className = 'event-editor-plant-dropdown';
    dropdown.setAttribute('aria-hidden', 'true');
    combo.appendChild(dropdown);

    let open = false;

    // Every option <button> here was already created once, during Start preload (see
    // preparePlantDropdownAssets in plantTypes.ts) - reused, never recreated.
    const worldName = State.data.selectedWorld || '';
    const { options, homeSet } = getPlantDropdownOptionsForWorld(worldName);
    for (const opt of options) {
      opt.starEl.style.display = homeSet.has(opt.name) ? '' : 'none';
      opt.starEl.title = `HomeWorld: ${worldName}`;
    }

    const emptyEl = document.createElement('div');
    emptyEl.className = 'event-editor-plant-empty';

    // Event delegation on dropdown for clicks to avoid one listener per option button
    dropdown.onclick = (e) => {
      const targetOpt = (e.target as HTMLElement).closest('.event-editor-plant-option');
      if (targetOpt) {
        e.preventDefault();
        e.stopPropagation();
        const name = (targetOpt as any)._plantName;
        if (name) {
          inputEl.value = name;
          onPick(name);
          closeDropdown();
        }
      }
    };

    function renderOptions(filter: string): void {
      const q = filter.trim().toLowerCase();
      let shown = 0;
      const currentValue = inputEl.value;

      for (const opt of options) {
        const matches = !q || opt.name.toLowerCase().includes(q);
        if (matches) {
          shown++;
          opt.el.style.display = '';
          if (opt.name === currentValue) {
            opt.el.classList.add('is-selected');
          } else {
            opt.el.classList.remove('is-selected');
          }
          if (opt.el.parentElement !== dropdown) dropdown.appendChild(opt.el);
        } else {
          opt.el.style.display = 'none';
        }
      }

      if (shown === 0) {
        emptyEl.textContent = options.length === 0 ? '未加载 PlantTypes' : '无匹配';
        if (emptyEl.parentElement !== dropdown) dropdown.appendChild(emptyEl);
        emptyEl.style.display = '';
      } else {
        emptyEl.style.display = 'none';
      }
    }

    const onDocDown = (e: MouseEvent) => {
      if (!document.body.contains(combo)) {
        document.removeEventListener('mousedown', onDocDown, true);
        return;
      }
      if (!combo.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    function openDropdown(): void {
      if (open) return;
      open = true;
      renderOptions(inputEl.value);
      dropdown.classList.add('is-open');
      dropdown.setAttribute('aria-hidden', 'false');
      toggleBtn.classList.add('is-open');
      document.addEventListener('mousedown', onDocDown, true);
    }

    function closeDropdown(): void {
      if (!open) return;
      open = false;
      dropdown.classList.remove('is-open');
      dropdown.setAttribute('aria-hidden', 'true');
      toggleBtn.classList.remove('is-open');
      document.removeEventListener('mousedown', onDocDown, true);
    }

    toggleBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (open) closeDropdown();
      else openDropdown();
    };

    const onFocus = () => openDropdown();
    const onInput = () => {
      if (!open) openDropdown();
      else renderOptions(inputEl.value);
    };
    inputEl.addEventListener('focus', onFocus);
    inputEl.addEventListener('input', onInput);
    // Recorded so the next buildPlantDropdown call on this same inputEl (next time this row
    // becomes a plant field again) can remove exactly these listeners before adding new ones.
    (inputEl as any)._plantDropdownHandlers = { focus: onFocus, input: onInput, onDocDown };
  }

  const COMMON_ROWS: Array<{ label: string | null; key?: string }> = [
    { label: 'Display Text', key: 'm_displayText' },
    { label: 'Unlocked Narr ID', key: 'm_unlockedNarrationID' },
    { label: 'Completed Narr ID', key: 'm_completedNarrationID' },
    { label: 'Parent Event', key: 'm_parentEvent' },
    { label: 'Unlock From', key: 'm_unlockedFrom' },
    { label: 'Visible From', key: 'm_visibleFrom' },
    { label: 'Auto-Visible', key: 'm_autoVisible' },
    { label: null },
    { label: 'Is Timed Event', key: 'm_isTimedEvent' },
    { label: 'Is Art Flipped', key: 'm_isArtFlipped' },
    { label: 'Is Challenge Type', key: 'm_isChallengeType' },
  ];

  const stopBubble = (e: MouseEvent) => e.stopPropagation();

  const overlay = document.createElement('div');
  overlay.className = 'event-editor-overlay';
  overlay.onmousedown = stopBubble;
  overlay.onmouseup = stopBubble;
  overlay.onclick = stopBubble;

  const modal = document.createElement('div');
  modal.className = 'event-editor-modal';
  modal.onmousedown = stopBubble;
  modal.onmouseup = stopBubble;
  modal.onclick = stopBubble;

  const header = document.createElement('div');
  header.className = 'event-editor-header';
  const title = document.createElement('div');
  title.className = 'event-editor-title';
  title.textContent = 'Event Property Editor';
  header.appendChild(title);
  modal.appendChild(header);

  const content = document.createElement('div');
  content.className = 'event-editor-content';
  modal.appendChild(content);

  function createRowWithElements(
      label: string | null,
      key: string | null,
      isDynamic: boolean = false
  ): { row: HTMLElement; labelEl: HTMLElement; inputEl: HTMLInputElement } {
    const row = document.createElement('div');
    row.className = 'event-editor-row';
    if (isDynamic) {
      row.style.minHeight = '32px';
      row.style.boxSizing = 'border-box';
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'event-editor-label';
    labelEl.textContent = label || '';

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'event-editor-input';
    // Bind to draft, never the live node
    const val = key ? (draft[key] ?? '') : '';
    inputEl.value = String(val);

    row.appendChild(labelEl);
    row.appendChild(inputEl);
    return { row, labelEl, inputEl };
  }

  function renderFixedHeader() {
    const headerRows = [
      { label: 'Event Name', key: 'm_name' },
      { label: 'Event Type', key: 'm_eventType' },
    ];

    headerRows.forEach((item) => {
      const { row, inputEl } = createRowWithElements(item.label, item.key, false);
      content.appendChild(row);

      if (item.key === 'm_eventType') {
        inputEl.readOnly = true;
        inputEl.style.cursor = 'pointer';
        inputEl.style.color = 'var(--accent-gold)';
        inputEl.onclick = () => {
          const types = getValidEventTypes();
          if (types.length === 0) return;
          let current = draft.m_eventType || types[0];
          let idx = types.indexOf(current);
          if (idx === -1) idx = 0;
          const nextType = types[(idx + 1) % types.length];
          // Draft only — map node and selection stay unchanged until Save
          draft.m_eventType = nextType;
          inputEl.value = nextType;
          updateDynamicRows();
        };
      } else {
        inputEl.oninput = () => {
          draft[item.key!] = inputEl.value;
        };
        inputEl.onchange = () => {
          draft[item.key!] = inputEl.value;
        };
      }
    });
  }

  let dynamicRow1: { row: HTMLElement; labelEl: HTMLElement; inputEl: HTMLInputElement } | null = null;
  let dynamicRow2: { row: HTMLElement; labelEl: HTMLElement; inputEl: HTMLInputElement } | null = null;

  function renderDynamicRows() {
    const row1 = createRowWithElements('', null, true);
    const row2 = createRowWithElements('', null, true);
    content.appendChild(row1.row);
    content.appendChild(row2.row);
    dynamicRow1 = row1;
    dynamicRow2 = row2;
  }

  function updateDynamicRows() {
    if (!dynamicRow1 || !dynamicRow2) return;

    const eventType = draft.m_eventType || '';
    const typeRows = getTypeRows(eventType);

    function shouldHideRow(rowData: { label: string | null; key?: string } | null): boolean {
      if (!rowData) return true;
      if (rowData.label === null && !rowData.key) return true;
      return false;
    }

    function setRow(
        rowObj: { row: HTMLElement; labelEl: HTMLElement; inputEl: HTMLInputElement },
        rowData: { label: string | null; key?: string } | null
    ) {
      if (shouldHideRow(rowData)) {
        rowObj.row.style.visibility = 'hidden';
        rowObj.labelEl.textContent = '';
        rowObj.inputEl.value = '';
        rowObj.inputEl.readOnly = true;
        rowObj.inputEl.style.cursor = 'default';
        rowObj.inputEl.onclick = null;
        rowObj.inputEl.oninput = null;
        rowObj.inputEl.onchange = null;
        rowObj.inputEl.removeAttribute('list');
        const oldCombo = rowObj.row.querySelector('.event-editor-plant-combo');
        if (oldCombo) {
          const trapped = oldCombo.querySelector('input.event-editor-input') as HTMLInputElement | null;
          if (trapped) rowObj.row.appendChild(trapped);
          oldCombo.remove();
        }
        const oldList = rowObj.row.querySelector('datalist.event-editor-plant-datalist');
        if (oldList) oldList.remove();
        const oldSel = rowObj.row.querySelector('select.event-editor-plant-select');
        if (oldSel) oldSel.remove();
        rowObj.inputEl.style.display = '';
        return;
      }

      rowObj.row.style.visibility = 'visible';
      const label = rowData!.label || '';
      const key = rowData!.key || '';
      rowObj.labelEl.textContent = label;
      const val = key ? (draft[key] ?? '') : '';

      rowObj.inputEl.removeAttribute('list');
      const prevCombo = rowObj.row.querySelector('.event-editor-plant-combo');
      if (prevCombo) {
        const trapped = prevCombo.querySelector('input.event-editor-input') as HTMLInputElement | null;
        if (trapped && trapped === rowObj.inputEl) {
          rowObj.row.appendChild(rowObj.inputEl);
        }
        prevCombo.remove();
      }
      const prevList = rowObj.row.querySelector('datalist.event-editor-plant-datalist');
      if (prevList) prevList.remove();
      const prevSel = rowObj.row.querySelector('select.event-editor-plant-select');
      if (prevSel) prevSel.remove();
      rowObj.inputEl.classList.remove('event-editor-plant-input');
      rowObj.inputEl.style.display = '';
      rowObj.inputEl.value = String(val);
      rowObj.inputEl.readOnly = false;
      rowObj.inputEl.style.cursor = 'text';
      rowObj.inputEl.onclick = null;
      rowObj.inputEl.oninput = null;
      rowObj.inputEl.onchange = null;

      const isPlantField =
          key === 'm_dataString' &&
          (eventType === 'plant' || eventType === 'plantbox');

      if (isPlantField) {
        rowObj.inputEl.value = String(val);
        rowObj.inputEl.readOnly = false;
        rowObj.inputEl.style.cursor = 'text';
        const commit = () => {
          draft[key] = rowObj.inputEl.value;
        };
        rowObj.inputEl.oninput = commit;
        rowObj.inputEl.onchange = commit;
        buildPlantDropdown(rowObj.inputEl, rowObj.row, (typeName) => {
          draft[key] = typeName;
        });
        return;
      }

      const isBool = [
        'm_autoVisible',
        'm_isTimedEvent',
        'm_isArtFlipped',
        'm_isChallengeType',
      ].includes(key);
      if (isBool) {
        rowObj.inputEl.readOnly = true;
        rowObj.inputEl.style.cursor = 'pointer';
        rowObj.inputEl.onclick = () => {
          const nextVal = !(draft[key] === true);
          draft[key] = nextVal;
          rowObj.inputEl.value = String(nextVal);
        };
      } else {
        rowObj.inputEl.oninput = () => {
          if (key) draft[key] = rowObj.inputEl.value;
        };
        rowObj.inputEl.onchange = () => {
          if (key) draft[key] = rowObj.inputEl.value;
        };
      }
    }

    setRow(dynamicRow1, typeRows[0] || null);
    setRow(dynamicRow2, typeRows[1] || null);
  }

  function renderFixedFooter() {
    COMMON_ROWS.forEach((item) => {
      const { row, inputEl } = createRowWithElements(item.label, item.key, false);
      content.appendChild(row);

      if (!item.key) return;

      const key = item.key;
      const isBool = [
        'm_autoVisible',
        'm_isTimedEvent',
        'm_isArtFlipped',
        'm_isChallengeType',
      ].includes(key);

      if (isBool) {
        inputEl.readOnly = true;
        inputEl.style.cursor = 'pointer';
        inputEl.onclick = () => {
          const nextVal = !(draft[key] === true);
          draft[key] = nextVal;
          inputEl.value = String(nextVal);
        };
      } else {
        inputEl.oninput = () => {
          draft[key] = inputEl.value;
        };
        inputEl.onchange = () => {
          draft[key] = inputEl.value;
        };
      }
    });
  }

  renderFixedHeader();
  renderDynamicRows();
  renderFixedFooter();
  updateDynamicRows();

  const footer = document.createElement('div');
  footer.className = 'event-editor-footer';
  footer.style.cssText = `
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 12px;
    margin-top: 12px;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'toolbar-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    flex: 1;
    padding: 6px 0;
    font-size: 12px;
    border-radius: 6px;
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #e4e4e7;
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
  `;
  cancelBtn.onmouseover = () => {
    cancelBtn.style.background = '#3f3f46';
    cancelBtn.style.borderColor = '#52525b';
  };
  cancelBtn.onmouseout = () => {
    cancelBtn.style.background = '#27272a';
    cancelBtn.style.borderColor = '#3f3f46';
  };
  // Cancel: discard draft; live node was never touched
  cancelBtn.onclick = () => {
    requestAnimationFrame(() => overlay.remove());
    requestNormalFrameBudget();
  };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'toolbar-btn';
  saveBtn.textContent = 'Save changes';
  saveBtn.style.cssText = `
    flex: 1;
    padding: 6px 0;
    font-size: 12px;
    border-radius: 6px;
    background: #c4a052;
    border: 1px solid #c4a052;
    color: #0c0c0e;
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
  `;
  saveBtn.onmouseover = () => {
    saveBtn.style.background = '#d4b470';
    saveBtn.style.borderColor = '#d4b470';
  };
  saveBtn.onmouseout = () => {
    saveBtn.style.background = '#c4a052';
    saveBtn.style.borderColor = '#c4a052';
  };

  saveBtn.onclick = async () => {
    const needsVisual = VISUAL_KEYS.some((k) => draft[k] !== original[k]);
    const needsPath = PATH_KEYS.some((k) => draft[k] !== original[k]);

    // Commit draft → live node only on Save
    for (const k of EDITABLE_KEYS) {
      if (k in draft) {
        node[k] = draft[k];
      }
    }

    if (needsVisual) {
      if (node.m_eventId != null) {
        invalidateEventResourceCacheForNode(node.m_eventId);
      }
      await refreshSingleObject(node, 'reload');
    } else if (needsPath) {
      PathFactory.refreshAfterMove();
    }

    overlay.remove();
    requestNormalFrameBudget();
    const pieceObj = State.data.pieces.find((p) => p.piece === node);
    if (pieceObj && pieceObj.element) {
      selectPiece({ node, element: pieceObj.element, kind: 'piece' });
    } else {
      const eventObj = State.data.eventPieces.find((p) => p.node === node);
      if (eventObj && eventObj.element) {
        selectPiece({ node, element: eventObj.element, kind: 'event' });
      }
    }
  };

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}