/**
 * AppShell — intro modal, upload, help, restart/clear/unload, overlay checkboxes.
 * Keeps EditorApp.bindEvents focused on the live map editor chrome.
 */

import { State } from '../core/state';
import { DOM, showConfirmModal } from './dom';
import { showToast, hideToast } from '../ui/toast';
import { populateWorldSelector } from '../ui/sidebar';
import { EditorState } from '../editor/EditorState';
import { clearSelection } from '../editor/Selection';
import {
  clearAll,
  unloadResourcePack,
  handleImageUpload,
  handleStartViewer,
} from '../editor/MapIO';

export type AppShellDeps = {
  resetCamera: () => void;
};

function hideEditorChrome(): void {
  const sideR = document.getElementById('sidebar-right');
  if (sideR) {
    sideR.style.display = 'none';
    sideR.classList.remove('sidebar-visible');
  }
  const toolbarMiddle = document.getElementById('toolbar-middle-controls');
  if (toolbarMiddle) toolbarMiddle.style.display = 'none';
  const toolbarRight = document.getElementById('toolbar-right-controls');
  if (toolbarRight) toolbarRight.style.display = 'none';
  const controlsBar = document.getElementById('controls-bar');
  if (controlsBar) controlsBar.style.display = 'none';
}

function showEditorChrome(): void {
  const sideR = document.getElementById('sidebar-right');
  if (sideR) {
    sideR.style.display = 'flex';
    sideR.classList.add('sidebar-visible');
  }
}

export function bindAppShell(deps: AppShellDeps): void {
  const ui = DOM.uiElements;

  // Upload zone
  ui.dropImageZone.onclick = () => ui.imageInput.click();
  ui.imageInput.onchange = async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    try {
      await handleImageUpload(files);
    } catch (err) {
      console.error('Error handling uploaded images:', err);
    }
  };

  // Drag-drop onto drop zone
  const dropZone = ui.dropImageZone;
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#c4a052';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#3f3f46';
  });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#3f3f46';
    if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;

    const items = e.dataTransfer.items;
    const collectedFiles: File[] = [];

    const traverseEntry = async (entry: any): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
        Object.defineProperty(file, 'customPath', {
          value: entry.fullPath.replace(/^\//, ''),
          writable: false,
        });
        collectedFiles.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readEntries = (): Promise<any[]> =>
          new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        let batch = await readEntries();
        while (batch.length > 0) {
          for (const child of batch) await traverseEntry(child);
          batch = await readEntries();
        }
      }
    };

    if (items && items.length > 0) {
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as any).webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) {
        for (const entry of entries) await traverseEntry(entry);
        if (collectedFiles.length > 0) {
          await handleImageUpload(collectedFiles);
          return;
        }
      }
    }

    await handleImageUpload(Array.from(e.dataTransfer.files));
  });

  // Start viewer
  ui.startButton.onclick = async () => {
    if (State.data.availableWorlds.length === 0) return;
    const ok = await handleStartViewer();
    if (!ok) return;

    ui.introModal.style.display = 'none';
    showEditorChrome();
    populateWorldSelector();
    if (DOM.uiElements.selectWorld) {
      DOM.uiElements.selectWorld.value = '';
    }
    deps.resetCamera();
  };

  // Inspector close
  const btnInspectorClose = document.getElementById('btn-inspector-close');
  if (btnInspectorClose) {
    btnInspectorClose.onclick = () => clearSelection();
  }

  // Help modal
  const btnHelp = document.getElementById('btn-help');
  const helpOverlay = document.getElementById('help-modal-overlay');
  const btnHelpClose = document.getElementById('btn-help-modal-close');
  const btnHelpOk = document.getElementById('btn-help-modal-ok');
  if (btnHelp && helpOverlay) {
    btnHelp.onclick = () => {
      helpOverlay.style.display = 'flex';
    };
  }
  if (btnHelpClose && helpOverlay) {
    btnHelpClose.onclick = () => {
      helpOverlay.style.display = 'none';
    };
  }
  if (btnHelpOk && helpOverlay) {
    btnHelpOk.onclick = () => {
      helpOverlay.style.display = 'none';
    };
  }

  // Overlay checkboxes → dirty camera for redraw
  const isoCheck = document.getElementById('isometric-grid-checkbox') as HTMLInputElement | null;
  if (isoCheck) {
    isoCheck.onchange = () => {
      EditorState.cameraDirty = true;
    };
  }
  const boundsCheck = document.getElementById('bounding-rect-checkbox') as HTMLInputElement | null;
  if (boundsCheck) {
    boundsCheck.onchange = () => {
      EditorState.cameraDirty = true;
    };
  }

  // Restart → upload screen
  const btnRestart = document.getElementById('btn-restart');
  if (btnRestart) {
    btnRestart.onclick = async () => {
      const ok = await showConfirmModal(
        '确定要重新启动编辑器并返回上传页面吗？所有未保存的编辑内容都将丢失。\n\nAre you sure you want to restart the editor and return to the upload screen? All unsaved changes will be lost.'
      );
      if (!ok) return;
      await unloadResourcePack(deps.resetCamera);
      hideEditorChrome();
    };
  }

  // Clear current world
  ui.btnClear.onclick = async () => {
    if (State.data.mapConfig) {
      const confirmUnload = await showConfirmModal(
        '确定要清除当前渲染并卸载世界吗？所有未保存的编辑都将丢失。\n\nAre you sure you want to clear the active render and unload the world? Unsaved edits will be lost.'
      );
      if (!confirmUnload) return;
      await clearAll(deps.resetCamera);
      showToast('已卸载世界地图');
    } else {
      await clearAll(deps.resetCamera);
    }
  };

  // Unload entire pack
  if (ui.btnUnloadPack) {
    ui.btnUnloadPack.onclick = async () => {
      const hasPack =
        State.data.availableWorlds.length > 0 ||
        Object.keys(State.data.globalFiles || {}).length > 0 ||
        (State.data.indexedFiles && State.data.indexedFiles.size > 0);

      if (!hasPack) {
        showToast('当前没有已加载的资源包');
        if (DOM.uiElements.introModal) {
          DOM.uiElements.introModal.style.display = 'flex';
        }
        hideEditorChrome();
        return;
      }

      const ok = await showConfirmModal(
        '确定要卸载全部已上传资源包并返回首页吗？\n地图编辑未保存内容将丢失，内存中的文件索引与缓存都会被清除。\n\nUnload the entire uploaded asset pack and return to the home screen? Unsaved edits will be lost.'
      );
      if (!ok) return;

      try {
        await unloadResourcePack(deps.resetCamera);
        if (DOM.uiElements.introModal) {
          DOM.uiElements.introModal.style.display = 'flex';
        }
        hideEditorChrome();
      } catch (err) {
        console.error('[UnloadPack]', err);
        hideToast();
        showToast('卸载失败，请查看控制台');
      }
    };
  }
}
