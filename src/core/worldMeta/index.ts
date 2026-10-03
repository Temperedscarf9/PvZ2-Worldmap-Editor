/**
 * World-map list metadata & animation-boundary helpers.
 * Extracted from renderer to break the events ↔ renderer circular dependency.
 */
import { State } from '../state';
import { WorldMapEventStatus } from '../../domain/types';

// ─── Animation delay / detail caches ────────────────────────────────────────

let cachedAnimationDetailsMap: Map<string, Array<{ animId: number; min: number; max: number }>> | null = null;
let cachedAnimationDelaysMap: Map<string, Array<{ min: number; max: number }>> | null = null;

export function clearAnimationDetailsCache(): void {
  cachedAnimationDetailsMap = null;
  cachedAnimationDelaysMap = null;
}

// ─── Parsed worldmaplist.json cache (module-level, not window) ───────────────

interface WorldMapListCache {
  parsedJson: any;
  fileRef: File | null;
}

const worldMapListCache: WorldMapListCache = { parsedJson: null, fileRef: null };

export function clearWorldMapListCache(): void {
  worldMapListCache.parsedJson = null;
  worldMapListCache.fileRef = null;
}

export async function getParsedWorldMapList(): Promise<any> {
  if (worldMapListCache.parsedJson) return worldMapListCache.parsedJson;

  if (!worldMapListCache.fileRef) {
    for (const [key, file] of State.data.indexedFiles.entries()) {
      if (key.endsWith('worldmaplist.json')) {
        worldMapListCache.fileRef = file;
        break;
      }
    }
  }

  if (worldMapListCache.fileRef) {
    try {
      const text = await worldMapListCache.fileRef.text();
      worldMapListCache.parsedJson = JSON.parse(text);
      return worldMapListCache.parsedJson;
    } catch (e) {
      console.error('[WorldMapList] failed to parse worldmaplist.json:', e);
    }
  }
  return null;
}

export async function fetchWorldMapListAnimationDelays(): Promise<
  Map<string, Array<{ min: number; max: number }>>
> {
  if (cachedAnimationDelaysMap) return cachedAnimationDelaysMap;

  const delaysMap = new Map<string, Array<{ min: number; max: number }>>();
  const data = await getParsedWorldMapList();

  if (data) {
    const objects = data?.objects || [];
    for (const obj of objects) {
      if (obj.objclass === 'WorldMapList') {
        const mapList = obj.objdata?.m_mapList || obj.objdata?.MapList || [];
        for (const item of mapList) {
          const mapName = item.MapName;
          const animationDelays = item.WorldResources?.AnimationDelays || [];
          if (mapName && animationDelays.length > 0) {
            const list: Array<{ min: number; max: number }> = [];
            for (const delay of animationDelays) {
              list.push({
                min: delay.TimeMin ?? 0,
                max: delay.TimeMax ?? 0,
              });
            }
            if (list.length > 0) {
              delaysMap.set(mapName.toLowerCase(), list);
            }
          }
        }
      }
    }
  }

  cachedAnimationDelaysMap = delaysMap;
  return delaysMap;
}

export async function fetchWorldMapListAnimationDetails(): Promise<
  Map<string, Array<{ animId: number; min: number; max: number }>>
> {
  if (cachedAnimationDetailsMap) return cachedAnimationDetailsMap;

  const detailsMap = new Map<string, Array<{ animId: number; min: number; max: number }>>();
  const data = await getParsedWorldMapList();

  if (data) {
    const objects = data?.objects || [];
    for (const obj of objects) {
      if (obj.objclass === 'WorldMapList') {
        const mapList = obj.objdata?.m_mapList || obj.objdata?.MapList || [];
        for (const item of mapList) {
          const mapName = item.MapName;
          const animDetails = item.WorldResources?.AnimationDetails || [];
          if (mapName && animDetails.length > 0) {
            const list: Array<{ animId: number; min: number; max: number }> = [];
            for (const detail of animDetails) {
              if (detail.AnimNumber !== undefined) {
                list.push({
                  animId: detail.AnimNumber,
                  min: detail.AnimReplayDelayTimeMin ?? 0,
                  max: detail.AnimReplayDelayTimeMax ?? 0,
                });
              }
            }
            if (list.length > 0) {
              detailsMap.set(mapName.toLowerCase(), list);
            }
          }
        }
      }
    }
  }

  cachedAnimationDetailsMap = detailsMap;
  return detailsMap;
}

export async function fetchWorldMapListEntryPoint(selectedWorld: string): Promise<string | null> {
  const data = await getParsedWorldMapList();
  if (data) {
    const objects = data?.objects || [];
    for (const obj of objects) {
      if (obj.objclass === 'WorldMapList') {
        const mapList = obj.objdata?.m_mapList || obj.objdata?.MapList || [];
        for (const item of mapList) {
          const mapName = item.MapName;
          if (mapName && mapName.toLowerCase() === selectedWorld.toLowerCase()) {
            return item.EntryPoint || item.entryPoint || item.m_entryPoint || item.m_EntryPoint || null;
          }
        }
      }
    }
  }
  return null;
}

export async function fetchWorldMapListLastLevel(selectedWorld: string): Promise<string | null> {
  const data = await getParsedWorldMapList();
  if (data) {
    const objects = data?.objects || [];
    for (const obj of objects) {
      if (obj.objclass === 'WorldMapList') {
        const mapList = obj.objdata?.m_mapList || obj.objdata?.MapList || [];
        for (const item of mapList) {
          const mapName = item.MapName;
          if (mapName && mapName.toLowerCase() === selectedWorld.toLowerCase()) {
            return item.LastLevel || item.lastLevel || item.m_lastLevel || item.m_LastLevel || null;
          }
        }
      }
    }
  }
  return null;
}

// ─── Editor runtime status overrides ────────────────────────────────────────

export const customEventStatusMap = new Map<number, WorldMapEventStatus>();
export const customCMap = new Map<number, number>();
export let lastLoadedWorld: string | null = null;
export let cachedSelectedWorldLastLevel: string | null = null;
export let isLastLevelNaturallyClearedGlobal = false;

export function setLastLoadedWorld(v: string | null): void {
  lastLoadedWorld = v;
}

export function setCachedSelectedWorldLastLevel(v: string | null): void {
  cachedSelectedWorldLastLevel = v;
}

export function setIsLastLevelNaturallyClearedGlobal(v: boolean): void {
  isLastLevelNaturallyClearedGlobal = v;
}

export function resetRendererRuntimeState(): void {
  customEventStatusMap.clear();
  customCMap.clear();
  lastLoadedWorld = null;
  cachedSelectedWorldLastLevel = null;
  isLastLevelNaturallyClearedGlobal = false;
}

// ─── Animation / static-image boundary ──────────────────────────────────────

let cachedMaxImageId: number | null = null;

export function clearMaxImageIdCache(): void {
  cachedMaxImageId = null;
}

/**
 * Returns the highest static island image id for the current world.
 * imageId > boundary means the piece is an animation (animN folder).
 */
export function getWorldAnimationBoundary(): number {
  if (cachedMaxImageId !== null) return cachedMaxImageId;

  const worldId: number = State.data.mapConfig?.objdata?.m_worldId || 1;
  const isLinear = State.data.isLinear;
  if (isLinear) {
    cachedMaxImageId = 99;
    return 99;
  }

  const isChina = State.data.isChinaVersion;
  const limit = isChina ? 11 : 5;

  if (worldId <= limit) {
    const worldName = State.data.selectedWorld;
    if (worldName) {
      const assets = State.data.worlds[worldName];
      if (assets?.images) {
        let maxI = 0;
        for (const filename of Object.keys(assets.images)) {
          const m = filename.match(/^island(\d+)\.png$/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxI) maxI = num;
          }
        }
        if (maxI > 0) {
          cachedMaxImageId = maxI - 1;
          return cachedMaxImageId;
        }
      }
    }
    const defaults: Record<number, number> = {
      2: 36, 3: 24, 4: 38, 5: 21, 6: 22, 7: 23, 8: 24, 9: 25, 10: 26, 11: 27,
    };
    cachedMaxImageId = defaults[worldId] || 99;
    return cachedMaxImageId;
  }
  cachedMaxImageId = 99;
  return 99;
}
