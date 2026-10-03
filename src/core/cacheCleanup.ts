/**
 * Single entry-point for clearing runtime caches.
 * 顺序：先拆已解码的 Image/Bitmap → 再 revoke ObjectURL → 最后清索引类 Map。
 *
 * `preservePreloadedAssets: true` 用于「只清当前地图实体、保留启动时(preloadAllMapAssets +
 * preloadAllPlantAssets)预热的全部资源缓存」：不清 animAssetsCache / composedPacketCache /
 * fileUrlCache / plantPacketPreloadCache / imageBitmapCache / eventResourceCache，
 * 避免下次切世界、解锁全部、或切换分辨率时重新读取文件/重新解码/重新解析事件资源。
 * 卸载整个资源包、或上传新资源包时务必传 false（默认）以释放全部内存。
 */
import { clearTintCache } from '../pam/canvas-player';
import {
  clearAnimAssetsCache,
  clearComposedPacketCache,
  clearFileUrlCache,
  clearImageBitmapCache,
} from './resources';
import { clearEventResourceCache } from '../events/resolveEventResources';
import {
  clearAnimationDetailsCache,
  clearWorldMapListCache,
  clearMaxImageIdCache,
  resetRendererRuntimeState,
} from './worldMeta';
import { clearPathImageCache } from '../render/PathRenderer';
import { pieceRuntimeMap } from './state';
import {
  clearPlantPacketPreloadCache,
  clearPlantTypeRegistry,
} from './resources/plantTypes';

export interface ClearRuntimeCacheOptions {
  /** Keep every Start-time preloaded cache warm (plants + map-piece/doodad + event resources).
   * Default false. */
  preservePreloadedAssets?: boolean;
}

export function clearAllRuntimeCaches(options: ClearRuntimeCacheOptions = {}): void {
  const keep = options.preservePreloadedAssets === true;

  // 1) 已解码栅格：动画帧 / 路径贴图 / ImageBitmap / 合成 packet
  if (!keep) {
    clearAnimAssetsCache();
    clearComposedPacketCache();
    clearPlantPacketPreloadCache();
    // Now warmed by preloadAllMapAssets' preloadWorldPathAssets for every world - preserve it
    // alongside the other preloaded raster caches instead of always discarding it.
    clearPathImageCache();
  }
  // Previously always cleared regardless of `keep` - this silently threw away every
  // Start-time-decoded pinata/upgrade/key-gate icon ImageBitmap on every ordinary world
  // switch, forcing a re-decode each time even though nothing about the underlying file
  // had changed.
  if (!keep) {
    clearImageBitmapCache();
  }

  // 2) Object URL（须在 Image.src 断开之后，避免解码器仍引用 blob）
  //    植物贴图 / packet blob 仍挂在 preload 缓存上时不可 revoke。
  if (!keep) {
    clearFileUrlCache();
  }

  // 3) 其它模块缓存与编辑器覆盖状态
  clearTintCache();
  clearAnimationDetailsCache();
  // Previously always cleared regardless of `keep` - this is the exact cache that makes
  // unlockAll / status-toggle / resolution-switch instant once Start-time preload has warmed
  // every (node × status × resolution) combination; clearing it unconditionally on every world
  // switch meant that preload work was wasted the moment the user actually opened a world.
  if (!keep) {
    clearEventResourceCache();
  }
  // Always cleared: the static/animation image-id boundary is world- (and China-flag-)
  // specific and memoized as a single value, not one per world - reusing a stale boundary
  // across a world switch would misclassify pieces as static vs. animated.
  clearMaxImageIdCache();
  // worldmaplist.json 与资源包绑定，清地图时保留；卸包时一并丢掉
  if (!keep) {
    clearWorldMapListCache();
    clearPlantTypeRegistry();
  }
  // Always cleared: per-session editor preview overrides and per-node render transform state,
  // not preloadable asset caches - must reset on every world-render teardown regardless.
  resetRendererRuntimeState();
  pieceRuntimeMap.clear();
}