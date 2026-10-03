/**
 * WorldSession — load / unload / switch world lifecycle.
 *
 * Owns the sequence: cancel render → dispose scene → load config → preload → render.
 * MapIO remains the file/index/upload surface; this module is the session orchestrator.
 */

import { State, pieceRuntimeMap } from '../core/state';
import {
  loadWorldMapConfig,
  rebuildWorldAssets,
  resolveResourceWorldIdentity,
} from '../core/resources';
import { resetRendererRuntimeState } from '../core/worldMeta';
import { clearAllRuntimeCaches } from '../core/cacheCleanup';
import { preloadWorldResources, cancelActiveRender, clearPlayers } from '../render/MapRenderer';
import { DOM, BBox } from '../app/dom';
import {
  hideGlobalLoading,
  nextFrame,
  showGlobalLoading,
  updateGlobalLoading,
  yieldToBrowser,
} from '../ui/loading';
import { showToast } from '../ui/toast';
import { EditorState } from './EditorState';
import { clearSelection } from './Selection';
import { collectAvailableImageIds } from './commands/AddCommand';
import { triggerMapRender } from './renderTrigger';
import { tryGetLayerStack, bindLayerStack } from '../scene/LayerStack';
import { PathFactory } from '../scene/factories/PathFactory';
import { HistoryManager } from './HistoryManager';

export type SessionCameraReset = () => void;

/**
 * Tear down the currently rendered map without touching the uploaded resource pack.
 * Prefer this over hand-clearing State.data.* container maps.
 */
export function disposeActiveScene(handleResetCamera: SessionCameraReset): void {
  cancelActiveRender();
  clearPlayers(); // also PathFactory.clear()
  clearSelection();
  HistoryManager.clear();

  const stack = tryGetLayerStack();
  if (stack) {
    stack.clear();
    bindLayerStack(null);
  }
  DOM.mapContainer.innerHTML = '';

  State.data.pieces = [];
  State.data.eventPieces = [];
  EditorState.rotatingPieces = [];
  State.data.mapConfig = null;
  State.data.selectedWorld = null;
  // LayerStack.syncStateMaps already cleared these when stack.clear() ran;
  // re-clear defensively for callers that never bound a stack.
  State.data.parallaxRoots.clear();
  State.data.parallaxContainers.clear();
  State.data.drawLayerContainers.clear();
  State.data.eventParallaxContainers.clear();
  State.data.eventDrawLayerContainers.clear();
  State.data.zombossContainer = null;
  State.data.pathContainer = null;
  State.data.eventContainer = null;
  pieceRuntimeMap.clear();

  if (DOM.uiElements.metaBar) {
    DOM.uiElements.metaBar.textContent = 'OBJECT_ID: UNKNOWN | WORLD_ID: UNKNOWN | WORLD: NONE';
  }
  if (DOM.activeWorldInfo) {
    DOM.activeWorldInfo.textContent = 'Active: NONE';
  }
  DOM.emptyBorder.style.display = 'block';

  handleResetCamera();
  if (BBox.canvas && BBox.ctx) {
    BBox.ctx.clearRect(0, 0, BBox.canvas.width, BBox.canvas.height);
  }
  EditorState.cameraDirty = true;
}

/**
 * Load a world by name: config → caches → preload → full render.
 */
export async function loadWorld(worldName: string): Promise<boolean> {
  if (!worldName) return false;

  showGlobalLoading(`正在加载世界 ${worldName.toUpperCase()}…`, '读取 worldmap.json');
  await nextFrame();
  await yieldToBrowser();

  try {
    const config = await loadWorldMapConfig(worldName);
    if (!config) {
      console.error('[WorldSession] Could not load worldmap.json for world:', worldName);
      showToast(`无法加载世界: ${worldName}`);
      return false;
    }

    State.data.mapConfig = config;
    State.data.selectedWorld = resolveResourceWorldIdentity(worldName);
    HistoryManager.clear();

    if (DOM.uiElements.metaBar) {
      DOM.uiElements.metaBar.textContent = `UID: ${config.uid} | WORLD: ${worldName.toUpperCase()}`;
    }
    if (DOM.activeWorldInfo) {
      DOM.activeWorldInfo.textContent = `Active: ${worldName.toUpperCase()}`;
    }

    updateGlobalLoading(`正在加载世界 ${worldName.toUpperCase()}…`, '重置运行时并清理缓存');
    await yieldToBrowser();

    resetRendererRuntimeState();
    rebuildWorldAssets();
    clearAllRuntimeCaches({ preservePreloadedAssets: true });
    {
      const available = collectAvailableImageIds();
      EditorState.defaultImageID = available.includes(EditorState.defaultImageID)
        ? EditorState.defaultImageID
        : available[0];
    }

    updateGlobalLoading(`正在加载世界 ${worldName.toUpperCase()}…`, '预加载贴图与动画资源');
    await yieldToBrowser();
    await preloadWorldResources(worldName, config, State.data.textureResolution);

    updateGlobalLoading(`正在加载世界 ${worldName.toUpperCase()}…`, '构建图层与动画时间线');
    await yieldToBrowser();
    await triggerMapRender({ resetCamera: true });

    await nextFrame();
    await yieldToBrowser();
    return true;
  } catch (err) {
    console.error('[WorldSession] loadWorld failed:', err);
    showToast(`加载世界失败: ${worldName}`);
    return false;
  } finally {
    hideGlobalLoading();
  }
}

/** Reset map to file state (discard in-memory edits). */
export async function reloadCurrentWorld(): Promise<void> {
  if (!State.data.selectedWorld) return;
  State.data.mapConfig = null;
  await loadWorld(State.data.selectedWorld);
}

export const WorldSession = {
  disposeActiveScene,
  loadWorld,
  reloadCurrentWorld,
};
