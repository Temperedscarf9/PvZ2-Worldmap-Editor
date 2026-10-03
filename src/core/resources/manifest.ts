/**
 * Upload-time file indexing and world discovery: turns the raw uploaded File[] into
 * State.data.{globalFiles,indexedFiles,filesByDir,worldMapFiles,availableWorlds}, and answers
 * "does this world actually have a resource directory" / "load its worldmap.json".
 */
import { WorldData, MapConfigObject } from '../../domain/types';
import { State } from '../state';
import { clearWorldMapListCache } from '../worldMeta';
import { getResDirName } from '../../utils/constants';
import { clearFindAnimCaches } from './find';

// International: ".../packages/worlds/{worldName}/worldmap.json"
const WORLDMAP_JSON_PATTERN_INTL = /(?:^|\/)packages\/worlds\/([^/]+)\/worldmap\.json$/;
// China: ".../packages/worlds/{worldName}.json" - no per-world subdirectory, no /worldmap.json
// suffix. Must be read fresh at indexFiles() call time (see below), not baked into a
// module-level constant - this used to be one const evaluated once when the module first
// loaded, almost certainly while State.data.isChinaVersion was still its initial `false` (the
// China-version checkbox isn't read until later, at upload time), so it could never actually
// switch to this pattern no matter what the user checked.
const WORLDMAP_JSON_PATTERN_CHINA = /(?:^|\/)packages\/worlds\/([^/]+)\.json$/;

// Worlds discovered as "rift1", "rift2", ... all share a single "twister" resource folder.
const RIFT_WORLD_PATTERN = /^rift/i;

export function resolveResourceWorldIdentity(worldName: string): string {
  return RIFT_WORLD_PATTERN.test(worldName) ? 'twister' : worldName;
}

function compareWorldNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * 判断某个世界是否有可用的地图资源目录。
 * 国际版：资源身份 rift* → twister；目录名 getResDirName（如 iceage → Iceage）；
 *         typeTag：egypt / tutorial → initial，其余 → full；
 *         目录形态（带或不带 convert/ 前缀均认可）：
 *           [convert/]images/<res>/<initial|full>/worldmap/<resDirName>/
 * 中文版：世界名直接当目录名用（不经过 getResDirName），且世界名在路径中出现两次
 *         （顶层分辨率子目录 + worldmap 下的子目录），没有 initial/full 标记：
 *           [convert/]images/<res>/<worldname>/worldmap/<worldname>/
 */
export function worldHasResourceDir(worldName: string): boolean {
  const resourceWorld = resolveResourceWorldIdentity(worldName);

  if (State.data.isChinaVersion) {
    const needle = `/${resourceWorld}/worldmap/${resourceWorld}/`;
    if (State.data.filesByDir) {
      for (const dir of State.data.filesByDir.keys()) {
        if (dir.replace(/\\/g, '/').includes(needle)) return true;
      }
    }
    const chinaPathSources: Iterable<string>[] = [];
    if (State.data.globalFiles) chinaPathSources.push(Object.keys(State.data.globalFiles));
    if (State.data.indexedFiles) chinaPathSources.push(State.data.indexedFiles.keys());
    for (const keys of chinaPathSources) {
      for (const raw of keys) {
        if (raw.replace(/\\/g, '/').includes(needle)) return true;
      }
    }
    return false;
  }

  const resDirName = getResDirName(resourceWorld);
  const typeTag = resourceWorld === 'egypt' || resourceWorld === 'tutorial' ? 'initial' : 'full';

  // 允许任意分辨率；目录分隔统一用 /
  const needle = `/worldmap/${resDirName}/`;
  const typeNeedle = `/${typeTag}/worldmap/${resDirName}/`;

  // 1) filesByDir：精确目录或子目录（anim0 等）
  if (State.data.filesByDir) {
    for (const dir of State.data.filesByDir.keys()) {
      const d = dir.replace(/\\/g, '/');
      if (d.includes(typeNeedle) || d.includes(needle)) {
        return true;
      }
    }
  }

  // 2) globalFiles / indexedFiles 兜底（目录未单独成 key 时）
  const pathSources: Iterable<string>[] = [];
  if (State.data.globalFiles) {
    pathSources.push(Object.keys(State.data.globalFiles));
  }
  if (State.data.indexedFiles) {
    pathSources.push(State.data.indexedFiles.keys());
  }
  for (const keys of pathSources) {
    for (const raw of keys) {
      const p = raw.replace(/\\/g, '/');
      if (p.includes(typeNeedle) || p.includes(needle)) {
        return true;
      }
    }
  }

  return false;
}

export function indexFiles(files: File[]): void {
  clearWorldMapListCache();
  clearFindAnimCaches();

  State.data.worlds = {};
  State.data.globalFiles = {};
  State.data.indexedFiles = new Map<string, File>();
  State.data.filesByDir = new Map<string, File[]>();
  State.data.resourceManifestFile = null;

  const worldMapFiles = new Map<string, File>();
  const worldmapJsonPattern = State.data.isChinaVersion
      ? WORLDMAP_JSON_PATTERN_CHINA
      : WORLDMAP_JSON_PATTERN_INTL;

  for (const f of files) {
    const rawPath = (f as any).customPath || f.webkitRelativePath || f.name;
    const path = rawPath.replace(/\\/g, '/');
    State.data.globalFiles[path] = f;

    const cIdx = path.indexOf('convert/');
    const canonical = cIdx !== -1 ? path.substring(cIdx) : path;
    State.data.indexedFiles.set(canonical, f);

    if (canonical === 'resource_manifest.json' || canonical.endsWith('/resource_manifest.json')) {
      State.data.resourceManifestFile = f;
    }

    const lastSlash = canonical.lastIndexOf('/');
    if (lastSlash !== -1) {
      const dir = canonical.substring(0, lastSlash + 1);
      if (!State.data.filesByDir.has(dir)) {
        State.data.filesByDir.set(dir, []);
      }
      State.data.filesByDir.get(dir)!.push(f);
    }

    const wmJsonMatch = path.match(worldmapJsonPattern);
    if (wmJsonMatch) {
      worldMapFiles.set(wmJsonMatch[1], f);
    }
  }

  State.data.worldMapFiles = worldMapFiles;

  // 只保留：有 worldmap.json，且存在对应资源目录的世界
  const withResources = Array.from(worldMapFiles.keys()).filter((name) => {
    const ok = worldHasResourceDir(name);
    if (!ok) {
      const resourceWorld = resolveResourceWorldIdentity(name);
      const expectedPath = State.data.isChinaVersion
          ? `images/*/${resourceWorld}/worldmap/${resourceWorld}/`
          : `images/*/worldmap/${getResDirName(resourceWorld)}/`;
      console.warn(
          `[WorldMap] Skip world "${name}": found packages/worlds/${name}/worldmap.json but no resource dir under ${expectedPath}`
      );
    }
    return ok;
  });

  State.data.availableWorlds = withResources.sort(compareWorldNames);
}

// Loads and parses the worldmap.json belonging to the given (auto-discovered) world folder name.
export async function loadWorldMapConfig(worldName: string): Promise<MapConfigObject | null> {
  // Dirty check: return in-memory config if the requested world is already loaded and modified in-memory
  const resolvedWorldName = resolveResourceWorldIdentity(worldName);
  if (State.data.selectedWorld === resolvedWorldName && State.data.mapConfig) {
    return State.data.mapConfig;
  }

  const file = State.data.worldMapFiles.get(worldName);
  if (!file) return null;
  try {
    const text = await file.text();
    const data: WorldData = JSON.parse(text);
    return data.objects?.[0] || null;
  } catch (e) {
    console.error('[WorldMap] Failed to parse worldmap.json for', worldName, e);
    return null;
  }
}

// Builds the image asset map for the currently selected world only (State.data.selectedWorld).
export function rebuildWorldAssets(): void {
  State.data.worlds = {};
  const worldName = State.data.selectedWorld;
  if (!worldName) return;

  State.data.worlds[worldName] = { images: {}, anims: {} };

  const matchStr = State.data.isChinaVersion
      ? `convert/images/${State.data.textureResolution}/${worldName}/worldmap/${worldName}/`
      : (() => {
        const resDirName = getResDirName(worldName);
        const typeTag = worldName === 'egypt' || worldName === 'tutorial' ? 'initial' : 'full';
        return `convert/images/${State.data.textureResolution}/${typeTag}/worldmap/${resDirName}/`;
      })();

  const matchingFiles = State.data.filesByDir.get(matchStr) || [];
  for (const f of matchingFiles) {
    const name = f.name;
    const fPath = name.replace(/\\/g, '/');
    if (name.endsWith('.png') && !fPath.includes('anim')) {
      State.data.worlds[worldName].images[name] = f;
    }
  }
}