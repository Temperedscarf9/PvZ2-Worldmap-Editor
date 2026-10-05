/**
 * App-shell level DOM plumbing: the single `DOM` element registry every other module reads
 * from, the hit-test `BBox` canvas, and the generic confirm-modal promise wrapper. Kept
 * dependency-free (no imports from editor/render/core) so every other module can safely import
 * it without risking a cycle.
 */
export function getEl<T extends HTMLElement>(id: string, fallbackIds?: string[]): T {
  let el = document.getElementById(id);
  if (!el && fallbackIds) {
    for (const fallback of fallbackIds) {
      el = document.getElementById(fallback);
      if (el) break;
    }
  }
  if (!el) {
    const tagName = id.startsWith('btn-') || id.includes('button') || id.startsWith('btn') ? 'button' :
        id.includes('select') ? 'select' :
            id.includes('check') || id.includes('input') ? 'input' : 'div';
    el = document.createElement(tagName);
  }
  return el as T;
}

export const DOM = {
  viewport:           getEl<HTMLDivElement>('viewport'),
  mapContainer:       getEl<HTMLDivElement>('map-container'),
  emptyBorder:        getEl<HTMLDivElement>('empty-state-border'),
  activeWorldInfo:    getEl<HTMLDivElement>('active-world-info'),
  uiElements: {
    zoomDisplay:      getEl<HTMLSpanElement>('zoom-disp', ['zoom-val']),
    footerCoord:      getEl<HTMLDivElement>('footer-coord', ['footer-coords']),
    resetButton:      getEl<HTMLButtonElement>('btn-recenter', ['reset-cam']),
    imageInput:       getEl<HTMLInputElement>('folder-upload-input', ['images-input']),
    startButton:      getEl<HTMLButtonElement>('start-viewer'),
    metaBar:          getEl<HTMLDivElement>('metadata-bar'),
    imageFolderName:  getEl<HTMLSpanElement>('img-folder-name'),
    dropImageZone:    getEl<HTMLDivElement>('file-drop-zone', ['drop-images']),
    introModal:       getEl<HTMLDivElement>('upload-modal', ['intro-modal']),
    btnClear:         getEl<HTMLButtonElement>('btn-restart', ['btn-clear']),
    btnUnloadPack:    getEl<HTMLButtonElement>('btn-unload-pack'),
    selectWorld:      getEl<HTMLSelectElement>('selected-world-select', ['world-select']),
    checkUnlockAll:   getEl<HTMLInputElement>('unlock-all-checkbox', ['check-unlock-all']),
    checkChinaVersion:getEl<HTMLInputElement>('china-version-checkbox', ['check-china-version']),
    checkIsLinear:    getEl<HTMLInputElement>('linear-paths-checkbox', ['check-is-linear']),
    selectTextureRes: getEl<HTMLSelectElement>('texture-res-select', ['texture-res']),
    // New toolbar
    modeIsland:       getEl<HTMLButtonElement>('btn-mode-island', ['mode-island']),
    modeDoodad:       getEl<HTMLButtonElement>('btn-mode-doodad', ['mode-doodad']),
    modeEvent:        getEl<HTMLButtonElement>('btn-mode-event', ['mode-event']),
    modeSelect:       getEl<HTMLButtonElement>('btn-mode-select', ['mode-select']),
    middleIslandDoodad: getEl<HTMLDivElement>('island-subtools', ['middle-island-doodad']),
    middleEvent:      getEl<HTMLDivElement>('event-subtools', ['middle-event']),
    middleSelect:     getEl<HTMLDivElement>('middle-select'),
    btnImgPrev:       getEl<HTMLButtonElement>('btn-img-prev'),
    btnImgNext:       getEl<HTMLButtonElement>('btn-img-next'),
    btnLayerDec:      getEl<HTMLButtonElement>('btn-layer-dec'),
    btnLayerInc:      getEl<HTMLButtonElement>('btn-layer-inc'),
    btnCurLayer:      getEl<HTMLButtonElement>('btn-cur-layer'),
    btnRotation:      getEl<HTMLButtonElement>('btn-island-rotation', ['btn-rotation']),
    btnFlip:          getEl<HTMLButtonElement>('btn-island-flip', ['btn-flip']),
    btnAdd:           getEl<HTMLButtonElement>('btn-island-add', ['btn-add']),
    btnMove:          getEl<HTMLButtonElement>('btn-island-move', ['btn-move']),
    btnDelete:        getEl<HTMLButtonElement>('btn-island-delete', ['btn-delete']),
    btnEventType:     getEl<HTMLButtonElement>('btn-event-type'),
    btnEventAdd:      getEl<HTMLButtonElement>('btn-event-add'),
    btnEventEdit:     getEl<HTMLButtonElement>('btn-event-edit'),
    btnEventMove:     getEl<HTMLButtonElement>('btn-event-move'),
    btnEventDelete:   getEl<HTMLButtonElement>('btn-event-delete'),
    btnAppend:        getEl<HTMLButtonElement>('btn-append'),
    btnSelectDelete:  getEl<HTMLButtonElement>('btn-select-delete'),
    btnPan:           getEl<HTMLButtonElement>('btn-pan'),
    btnSnapToggle:    getEl<HTMLButtonElement>('snap-grid-checkbox', ['btn-snap-toggle']),
    btnMapOnly:       getEl<HTMLButtonElement>('map-textures-checkbox', ['btn-map-only']),
    btnSaveMap:       getEl<HTMLButtonElement>('btn-save', ['btn-save-map']),
    btnResetMap:      getEl<HTMLButtonElement>('btn-restart', ['btn-reset-map']),
    globalLoadingOverlay: getEl<HTMLDivElement>('global-loading-overlay'),
    globalLoadingText:    getEl<HTMLDivElement>('global-loading-text'),
    globalLoadingSub:     getEl<HTMLDivElement>('global-loading-sub'),
  },
};

export const BBox = {
  canvas: getEl<HTMLCanvasElement>('bounds-canvas', ['bbox-layer']),
  ctx: null as CanvasRenderingContext2D | null,
};

export function showConfirmModal(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-modal-overlay') as HTMLDivElement;
    const msgEl = document.getElementById('confirm-modal-message') as HTMLParagraphElement;
    const btnOk = document.getElementById('confirm-modal-ok') as HTMLButtonElement;
    const btnCancel = document.getElementById('confirm-modal-cancel') as HTMLButtonElement;

    if (!overlay || !msgEl || !btnOk || !btnCancel) {
      resolve(confirm(message));
      return;
    }

    msgEl.textContent = message;
    overlay.style.display = 'flex';

    const cleanup = (result: boolean) => {
      overlay.style.display = 'none';
      btnOk.onclick = null;
      btnCancel.onclick = null;
      resolve(result);
    };

    btnOk.onclick = () => cleanup(true);
    btnCancel.onclick = () => cleanup(false);
  });
}
