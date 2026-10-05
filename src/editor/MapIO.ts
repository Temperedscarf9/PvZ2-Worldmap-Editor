import { State } from '../core/state';
import {
  indexFiles,
  loadPlantPacketMetadata,
} from '../core/resources';
import {
  loadPlantTypes,
  preloadAllPlantAssets,
  rebuildPlantPacketCache,
  clearPlantPacketPreloadCache,
  clearPlantTypeRegistry,
  preparePlantDropdownAssets,
} from '../core/resources/plantTypes';
import { preloadAllMapAssets } from '../core/resources/preloadAllMapAssets';
import { clearAllRuntimeCaches } from '../core/cacheCleanup';
import { DOM, showConfirmModal } from '../app/dom';
import { hideGlobalLoading, nextFrame, showGlobalLoading, updateGlobalLoading, yieldToBrowser } from '../ui/loading';
import { showToast, hideToast } from '../ui/toast';
import { populateWorldSelector } from '../ui/sidebar';
import { updateToolbarState } from '../ui/toolbar';
import { resetEditorState } from './EditorState';
import { disposeActiveScene, loadWorld, reloadCurrentWorld } from './WorldSession';

export function autoSaveToLocalStorage(): void {
  // No-op: Do not automatically save modified data to local storage.
}

/**
 * 卸载当前已渲染的地图（保留资源包）。委托 WorldSession.disposeActiveScene。
 */
export function resetActiveMapRenderState(handleResetCamera: () => void): void {
  disposeActiveScene(handleResetCamera);
}

export async function clearAll(handleResetCamera: () => void): Promise<void> {
  showGlobalLoading('正在清空地图…', '取消渲染并释放播放器');
  await nextFrame();
  await yieldToBrowser();

  try {
    resetActiveMapRenderState(handleResetCamera);
    if (DOM.uiElements.selectWorld) {
      DOM.uiElements.selectWorld.value = '';
    }

    updateGlobalLoading('正在清空地图…', '清理缓存（保留预热资源）');
    await yieldToBrowser();

    // 只释放地图实体相关缓存；植物 / mapPiece / doodad / event 资源在 Start 时已预热，保留
    clearAllRuntimeCaches({ preservePreloadedAssets: true });

    // 等浏览器真正完成这次 DOM 变更的布局/绘制之后再收起 loading，而不是 JS 一执行完就收起——
    // JS 同步完成不代表浏览器已经画完，两者之间的空隙就是"loading 消失但仍无法交互"的来源。
    await nextFrame();
    await yieldToBrowser();
  } finally {
    hideGlobalLoading();
  }
}

/**
 * 卸载内存中的完整上传资源包，回到启动首页。
 * 与 clearAll（仅清当前地图渲染）不同：会清空文件索引、manifest、世界列表等。
 */
export async function unloadResourcePack(handleResetCamera: () => void): Promise<void> {
  showGlobalLoading('正在卸载资源包…', '清理地图渲染');
  await nextFrame();
  await yieldToBrowser();

  // 1) 先卸当前地图：销毁 PamCanvasPlayer、拆 DOM、清容器引用
  //    （必须先于清缓存，否则播放器仍握着 animation/textureMap）
  resetActiveMapRenderState(handleResetCamera);

  if (DOM.uiElements.selectWorld) {
    DOM.uiElements.selectWorld.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- 未找到 --';
    DOM.uiElements.selectWorld.appendChild(opt);
    DOM.uiElements.selectWorld.value = '';
    DOM.uiElements.selectWorld.disabled = true;
  }

  updateGlobalLoading('正在卸载资源包…', '释放解码贴图与 Object URL');
  await yieldToBrowser();

  // 2) 释放解码像素 + revoke blob URL + 编辑器运行时状态（含全部预热缓存）
  clearAllRuntimeCaches({ preservePreloadedAssets: false });
  clearPlantPacketPreloadCache();
  clearPlantTypeRegistry();

  // 给异步 bitmap.close / img decode 释放一点时间
  await yieldToBrowser();
  await nextFrame();

  updateGlobalLoading('正在卸载资源包…', '清空文件索引');
  await yieldToBrowser();

  // 3) 丢掉所有 File 强引用（之后 WeakMap 缓存也可被 GC）
  State.data.worlds = {};
  State.data.globalFiles = {};
  State.data.indexedFiles = new Map();
  State.data.filesByDir = new Map();
  State.data.resourceManifestFile = null;
  State.data.worldMapFiles = new Map();
  State.data.availableWorlds = [];
  State.data.plantPacketMeta = new Map();
  State.data.unlockAll = false;
  State.data.isMapOnly = false;
  State.data.boxLeft = 0;
  State.players = [];

  // 4) 编辑器局部状态（默认图/层、工具模式）
  resetEditorState();
  updateToolbarState();

  // 5) 重置文件选择器（主 id + fallback），去掉浏览器对 FileList 的引用
  for (const id of ['folder-upload-input', 'images-input']) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = '';
  }
  if (DOM.uiElements.imageInput) DOM.uiElements.imageInput.value = '';

  // 6) 恢复启动页 UI
  if (DOM.uiElements.imageFolderName) {
    DOM.uiElements.imageFolderName.textContent = '点击浏览或拖拽文件夹…';
  }
  if (DOM.uiElements.startButton) {
    DOM.uiElements.startButton.disabled = true;
  }

  const sideR = document.getElementById('sidebar-right');
  if (sideR) sideR.style.display = 'none';

  if (DOM.uiElements.introModal) {
    DOM.uiElements.introModal.style.display = 'flex';
  }

  if (DOM.uiElements.checkChinaVersion) {
    DOM.uiElements.checkChinaVersion.checked = State.data.isChinaVersion;
  }
  if (DOM.uiElements.checkIsLinear) {
    DOM.uiElements.checkIsLinear.checked = State.data.isLinear;
  }
  if (DOM.uiElements.checkUnlockAll) {
    DOM.uiElements.checkUnlockAll.checked = false;
  }

  updateGlobalLoading('正在卸载资源包…', '完成');
  await yieldToBrowser();
  hideGlobalLoading();
  // Clear any stale toasts from mid-unload handlers, then show a single success message.
  hideToast();
  showToast('资源包已卸载，已返回首页');
}

export function handleSaveMap(): void {
  if (!State.data.mapConfig || !State.data.selectedWorld) {
    showToast('当前没有已加载的世界地图，无法保存！');
    return;
  }

  const worldName = State.data.selectedWorld;
  const exportData = {
    objects: [State.data.mapConfig]
  };
  const jsonStr = JSON.stringify(exportData, null, 2);

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `worldmap_${worldName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`已下载 worldmap_${worldName}.json`);
}

export async function handleResetMap(): Promise<void> {
  if (!State.data.selectedWorld) return;

  const confirmReset = await showConfirmModal(
    'Are you sure you want to reset the map to the original file status? All unsaved edits will be lost.'
  );
  if (!confirmReset) return;

  showToast('已重置为原始文件状态');
  await reloadCurrentWorld();
}

export async function handleWorldSelect(worldName: string): Promise<void> {
  await loadWorld(worldName);
}

export async function handleImageUpload(files: File[] | FileList): Promise<void> {
  if (!files || files.length === 0) return;
  const fileArray = Array.isArray(files) ? files : Array.from(files);

  showGlobalLoading('正在索引资源文件…', `${fileArray.length} 个文件`);
  await nextFrame();
  await yieldToBrowser();

  try {
    // Upload phase: index only. All plant/map warmup runs in handleStartViewer after
    // the user clicks Start — loading PlantTypes / packet meta / decoding assets here
    // raced with intro UI and could fail or stall before Start was even pressed.
    indexFiles(fileArray);

    populateWorldSelector();

    DOM.uiElements.imageFolderName.textContent = `${fileArray.length} assets loaded`;
    const hasWorlds = State.data.availableWorlds.length > 0;
    DOM.uiElements.startButton.disabled = !hasWorlds;

    if (!hasWorlds) {
      const foundConfigs = State.data.worldMapFiles.size;
      if (foundConfigs === 0) {
        showToast(
            '未找到任何世界配置文件（packages/worlds/...），请确认上传的是完整资源根目录；' +
            '如果这是中文版资源包，请勾选"中国版本"后重新选择文件夹（反之亦然）',
            undefined,
            7000
        );
      } else {
        showToast(
            `找到 ${foundConfigs} 个世界配置文件，但没有一个能匹配到对应的贴图目录，详见控制台日志`,
            undefined,
            7000
        );
      }
    }

    // New pack: drop any previous session warm caches (Start will rebuild them).
    clearAllRuntimeCaches({ preservePreloadedAssets: false });
    clearPlantPacketPreloadCache();
  } finally {
    hideGlobalLoading();
  }
}

/**
 * Called when the user clicks 🚀 启动查看器：hide intro, then pre-compose every plant
 * packet, warm every plant animation, AND warm every mapPiece/doodad/event resource for
 * every discovered world at both texture resolutions, before the editor is usable. This is
 * the only point in the session where it's safe to walk every world without the user seeing
 * anything change - by the time they're actually looking at a world, switching worlds,
 * toggling unlockAll, or cycling a node's status should all just hit warm caches instead of
 * doing file reads/decodes/canvas draws on demand.
 */
export async function handleStartViewer(): Promise<boolean> {
  if (State.data.availableWorlds.length === 0) return false;

  showGlobalLoading('正在预热植物资源…', '读取 packet / PlantTypes 元数据');
  await nextFrame();
  await yieldToBrowser();

  try {
    // All warmup lives here (after Start), not on upload:
    // metadata → plant anims/packets → plant picker → every world map asset.
    await loadPlantPacketMetadata();
    await loadPlantTypes();

    await preloadAllPlantAssets((phase, current, total) => {
      if (phase === 'plant-anims') {
        updateGlobalLoading('正在预热植物资源…', `动画 ${current}/${total}`);
      } else if (phase === 'plant-packets') {
        updateGlobalLoading('正在预热植物资源…', `种子包 ${current}/${total}`);
      }
    });

    updateGlobalLoading('正在预热植物资源…', '构建选择器控件');
    await yieldToBrowser();
    preparePlantDropdownAssets();

    updateGlobalLoading(
      '正在预热地图资源…',
      `共 ${State.data.availableWorlds.length} 个世界 × 2 档分辨率`
    );
    await yieldToBrowser();
    try {
      await preloadAllMapAssets((_phase, current, total) => {
        updateGlobalLoading('正在预热地图资源…', `${current}/${total}`);
      });
    } catch (err) {
      console.error('[MapAssetPreload] preload on start failed:', err);
      showToast('地图资源预热失败，将按需加载');
    }

    return true;
  } catch (err) {
    console.error('[PlantTypes] preload on start failed:', err);
    showToast('植物资源预热失败，将按需加载');
    return true; // still allow entering the editor
  } finally {
    hideGlobalLoading();
  }
}

/** Re-run plant preload after China / resolution toggle. */
export async function handleRebuildPlantAssets(): Promise<void> {
  showGlobalLoading('正在重建植物资源…', '');
  await nextFrame();
  try {
    await rebuildPlantPacketCache((phase, current, total) => {
      if (phase === 'plant-anims') {
        updateGlobalLoading('正在重建植物资源…', `动画 ${current}/${total}`);
      } else if (phase === 'plant-packets') {
        updateGlobalLoading('正在重建植物资源…', `种子包 ${current}/${total}`);
      }
    });
  } finally {
    hideGlobalLoading();
  }
}