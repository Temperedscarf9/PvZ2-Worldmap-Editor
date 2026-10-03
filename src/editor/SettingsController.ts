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
} from '../core/resources';
import { clearEventResourceCache } from '../events/resolveEventResources';
import { preloadWorldResources } from '../render/MapRenderer';
import { DOM } from '../app/dom';
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

  // Pre-pack: preparatory only — Start preload reads the flag fresh.
  if (State.data.availableWorlds.length === 0) return;

  showGlobalLoading('正在切换版本…', '重新装载 packet 元数据');
  await nextFrame();
  await yieldToBrowser();
  try {
    await loadPlantPacketMetadata();
    clearComposedPacketCache();
    clearEventResourceCache();
    await handleRebuildPlantAssets();
    if (State.data.mapConfig && deps) {
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
  State.data.textureResolution = value;
  applyHitboxCssVar(value);
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
      await deps.triggerMapRender();
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
      ui.checkChinaVersion.checked = State.data.isChinaVersion;
      ui.checkChinaVersion.onchange = async (e) => {
        await onChinaVersionChange((e.target as HTMLInputElement).checked);
      };
    }

    if (ui.checkIsLinear) {
      ui.checkIsLinear.checked = State.data.isLinear;
      ui.checkIsLinear.onchange = (e) => {
        State.data.isLinear = (e.target as HTMLInputElement).checked;
      };
    }

    if (ui.selectTextureRes) {
      ui.selectTextureRes.onchange = async (e) => {
        await onTextureResolutionChange(Number((e.target as HTMLSelectElement).value));
      };
    }
  },
};
