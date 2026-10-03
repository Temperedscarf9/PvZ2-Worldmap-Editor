/**
 * Locates animation JSON/PNG folders and static texture files within the uploaded pack,
 * memoized by (lookup key + current texture resolution / linear-mode) since the underlying
 * File objects never change during a session.
 */
import { RawAnimFolderData } from '../../domain/types';
import { State } from '../state';
import { CONFIG, getResDirName, toTexturePath, toJsonPath } from '../../utils/constants';

export const pieceAnimCache = new Map<string, RawAnimFolderData | null>();
export const animInGlobalCache = new Map<string, RawAnimFolderData | null>();

export function clearFindAnimCaches(): void {
  pieceAnimCache.clear();
  animInGlobalCache.clear();
}

/** get-or-compute against a Map that also memoizes "confirmed absent" (null) results. */
function memoizedLookup<T>(cache: Map<string, T | null>, cacheKey: string, compute: () => T | null): T | null {
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }
  const result = compute();
  cache.set(cacheKey, result);
  return result;
}

/**
 * Given the directory (at CONFIG.animJsonRes) holding an animation's JSON, swaps in the
 * current texture resolution to collect the matching PNG frames.
 * Path is tagged with texture res so multi-resolution preloads cache separately.
 */
function buildAnimFolderData(dir: string, jsonFile: File): RawAnimFolderData {
  const animRes = CONFIG.animJsonRes; // typically '768' — JSON always lives here
  const texRes = String(State.data.textureResolution);
  const textureFolder = dir.replace(`/${animRes}/`, `/${texRes}/`);
  const files = (State.data.filesByDir.get(textureFolder) || []).filter((f) => f.name.endsWith('.png'));
  return { json: jsonFile, files, path: `${dir}${jsonFile.name}|tex${texRes}` };
}

export function findPieceAnim(worldName: string, animIndex: number): RawAnimFolderData | null {
  const isLinear = State.data.isLinear;
  const isChina = State.data.isChinaVersion;
  const cacheKey = `${worldName}_${animIndex}_${State.data.textureResolution}_${isLinear ? 'L' : 'N'}_${isChina ? 'cn' : 'ww'}`;

  return memoizedLookup(pieceAnimCache, cacheKey, () => {
    if (!State.data.filesByDir) return null;

    let targetDir: string;
    if (isChina) {
      // China: no initial/full tag, no getResDirName mapping (world resource dirs are just the
      // raw world name), and always anim_{worldname}{N} regardless of isLinear - the
      // international linear-vs-non-linear folder-naming split doesn't exist in this build.
      targetDir = `convert/images/${CONFIG.animJsonRes}/${worldName}/worldmap/anim_${worldName}${animIndex}/`;
    } else {
      const resDirName = getResDirName(worldName);
      const typeTag = worldName === 'egypt' || worldName === 'tutorial' ? 'initial' : 'full';
      const base = `convert/images/${CONFIG.animJsonRes}/${typeTag}/worldmap`;
      targetDir = isLinear
          ? `${base}/${resDirName}/anim${animIndex}/`
          : `${base}/anim_${worldName}${animIndex}/`;
    }

    const dirFiles = State.data.filesByDir.get(targetDir);
    const json = dirFiles?.find((f) => f.name.endsWith('.json'));
    if (!json) return null;

    return buildAnimFolderData(targetDir, json);
  });
}

export function findAnimInGlobal(subPath: string): RawAnimFolderData | null {
  const cacheKey = `${subPath}_${State.data.textureResolution}`;

  return memoizedLookup(animInGlobalCache, cacheKey, () => {
    if (!State.data.filesByDir) return null;

    let targetDir = 'convert/' + toJsonPath(subPath).replace(/\\/g, '/');
    if (!targetDir.endsWith('/')) targetDir += '/';

    const dirFiles = State.data.filesByDir.get(targetDir);
    const foundJsonFile = dirFiles?.find((f) => f.name.endsWith('.json'));
    if (!foundJsonFile) return null;

    return buildAnimFolderData(targetDir, foundJsonFile);
  });
}

/**
 * Resolve a static file under convert/.
 * Default: rewrite images/<n>/ → current textureResolution.
 * Pass `resolution` to load a specific tier (multi-res preload).
 */
export function findFileInGlobal(subPath: string, resolution?: number): File | null {
  const res = resolution ?? State.data.textureResolution;
  const texSubPath = toTexturePath(subPath, res).replace(/\\/g, '/');
  const target = 'convert/' + texSubPath;
  if (!State.data.indexedFiles) return null;
  return State.data.indexedFiles.get(target) || null;
}