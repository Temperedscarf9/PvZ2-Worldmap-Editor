/**
 * SettingsController — world select, unlock-all, China version, linear path, texture resolution.
 * Keeps mid-session rebuild sequences out of EditorApp.bindEvents.
 */

import { State } from '../core/state';
import { applyHitboxCssVar } from '../utils/scale';
import {
  clearComposedPacketCache,
  loadPlantPacketMetadata,
  rebuildWorldAssets,
  indexFiles,
  clearImageBitmapCache,
  getAvailableTextureResolutions,
} from '../core/resources';
import { clearEventResourceCache } from '../events/resolveEventResources';
import { clearPathImageCache } from '../render/PathRenderer';
import { preloadWorldResources } from '../render/MapRenderer';
import { DOM } from '../app/dom';
import { clearMaxImageIdCache } from '../core/worldMeta';
import { populateWorldSelector } from '../ui/sidebar';
import {
  showGlobalLoading,
  hideGlobalLoading,
  nextFrame,
  yieldToBrowser,
  updateGlobalLoading,
  runWithDeferredLoading,
} from '../ui/loading';
import { showToast } from '../ui/toast';
import { handleWorldSelect, handleRebuildPlantAssets } from './MapIO';

export type SettingsDeps = {
  triggerMapRender: (options?: { eventOnly?: boolean; resetCamera?: boolean }) => Promise<void>;
};

let deps: SettingsDeps | null = null;

async function onChinaVersionChange(checked: boolean): Promise<void> {
  State.data.isChinaVersion = checked;

  // Before Start: flip flag + re-index only (worldmap path patterns differ CN/Intl).
  // Do NOT load PlantTypes / packets / decode assets — that waits for Start.
  if (!State.data.mapConfig) {
    clearComposedPacketCache();
    clearEventResourceCache();
    const files = Object.values(State.data.globalFiles || {});
    if (files.length > 0) {
      indexFiles(files);
      populateWorldSelector();
      if (DOM.uiElements.startButton) {
        DOM.uiElements.startButton.disabled = State.data.availableWorlds.length === 0;
      }
    }
    showToast(
      State.data.isChinaVersion
        ? '已标记为中国版'
        : '已标记为国际版'
    );
    return;
  }

  showGlobalLoading('正在切换版本…', '重新装载 packet 元数据');
  await nextFrame();
  await yieldToBrowser();
  try {
    await loadPlantPacketMetadata();
    clearComposedPacketCache();
    clearEventResourceCache();
    await handleRebuildPlantAssets();
    if (deps) {
      updateGlobalLoading('正在切换版本…', '重新渲染地图');
      await deps.triggerMapRender();
    }
    await nextFrame();
    await yieldToBrowser();
  } finally {
    hideGlobalLoading();
  }
  showToast(
    State.data.isChinaVersion
      ? '已切换为中国版资源路径，植物资源已重建'
      : '已切换为国际版资源路径，植物资源已重建'
  );
}

async function onTextureResolutionChange(value: number): Promise<void> {
  const available = getAvailableTextureResolutions();
  if (available.length > 0 && !available.includes(value)) {
    const select = DOM.uiElements.selectTextureRes;
    if (select) select.value = String(State.data.textureResolution);
    showToast(`资源包没有 ${value} 分辨率目录，已保持 ${State.data.textureResolution}`);
    return;
  }
  if (value === State.data.textureResolution) return;

  State.data.textureResolution = value;

  // Switching resolution changes the texture-pixel coordinate system. Reset the camera to
  // the start view (the same design area thanks to ZoomHelper's resolution factor) instead
  // of carrying stale texture-pixel offsets into the new map.
  if (State.data.mapConfig && State.data.selectedWorld) {
    State.camera.x = 0;
    State.camera.y = 0;
    State.camera.scale = 1;
  }

  applyHitboxCssVar(value);
  clearPathImageCache();
  clearEventResourceCache();
  clearImageBitmapCache();
  showGlobalLoading('正在切换分辨率…', `分辨率 → ${State.data.textureResolution}`);
  await nextFrame();
  await yieldToBrowser();
  try {
    rebuildWorldAssets();
    if (State.data.selectedWorld && State.data.mapConfig && deps) {
      await preloadWorldResources(
        State.data.selectedWorld,
        State.data.mapConfig,
        State.data.textureResolution
      );
      updateGlobalLoading('正在切换分辨率…', '重新渲染地图');
      await deps.triggerMapRender({ resetCamera: true });
      await nextFrame();
      await yieldToBrowser();
    }
  } finally {
    hideGlobalLoading();
  }
}

export const SettingsController = {
  bind(d: SettingsDeps): void {
    deps = d;
    const ui = DOM.uiElements;

    if (ui.selectWorld) {
      ui.selectWorld.onchange = async (e) => {
        const worldName = (e.target as HTMLSelectElement).value;
        // Unload / clear rebuilds the <select> with an empty option — ignore that.
        if (!worldName) return;
        try {
          await handleWorldSelect(worldName);
        } catch (err) {
          console.error('Error selecting world:', err);
        }
      };
    }

    if (ui.checkUnlockAll) {
      ui.checkUnlockAll.onchange = async (e) => {
        State.data.unlockAll = (e.target as HTMLInputElement).checked;
        if (State.data.mapConfig && deps) {
          await runWithDeferredLoading(
            '正在重新解析事件资源…',
            '解锁全部: ' + (State.data.unlockAll ? '开' : '关'),
            () => deps!.triggerMapRender({ eventOnly: true })
          );
        }
      };
    }

    if (ui.checkChinaVersion) {
      // Respect the checkbox's initial state instead of forcing State's default onto it.
      State.data.isChinaVersion = ui.checkChinaVersion.checked;
      ui.checkChinaVersion.onchange = async (e) => {
        await onChinaVersionChange((e.target as HTMLInputElement).checked);
      };
    }

    if (ui.checkIsLinear) {
      // The HTML ships with linear checked; State defaults to false. Adopt the DOM value here,
      // otherwise the first world loads as a non-linear map and the static/animation boundary
      // is computed from the wrong maximum image id.
      State.data.isLinear = ui.checkIsLinear.checked;
      ui.checkIsLinear.onchange = (e) => {
        State.data.isLinear = (e.target as HTMLInputElement).checked;
        clearMaxImageIdCache();
        if (State.data.mapConfig && deps) {
          void deps.triggerMapRender({ resetCamera: false });
        }
      };
    }

    if (ui.selectTextureRes) {
      ui.selectTextureRes.onchange = async (e) => {
        await onTextureResolutionChange(Number((e.target as HTMLSelectElement).value));
      };
    }
  },
};
