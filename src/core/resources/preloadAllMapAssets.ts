/**
 * Comprehensive Start-time preload for every map-render asset OTHER than plants (plants have
 * their own preloadAllPlantAssets in ./plantTypes, which this module runs alongside but does
 * not duplicate).
 *
 * Scope, mirroring what the render pipeline actually reads on demand:
 *   - mapPiece / doodad: both draw from the same per-world island-image pool (static
 *     islandN.png files + animN/ folders) - see render/PieceLoader.ts and
 *     events/resolvers/doodad.ts. Warmed once per (world, resolution).
 *   - event nodes: every m_eventList entry's resolveEventResources() output - see
 *     events/resolveEventResources.ts and events/resolvers/*.ts. Warmed once per
 *     (world, resolution, status) for status-sensitive types, once for doodads (whose
 *     resolver ignores status entirely).
 *
 * Resolutions: intentionally hardcoded to [1536, 768] - the only two the texture-res dropdown
 * ever offers - rather than discovering every images/<N>/ tier present in the pack (unlike
 * plantTypes.ts's discoverImageResolutions()). Preloading resolutions nothing in the UI can
 * select would just be wasted work.
 *
 * Every cache this module writes into (animAssetsCache / imageBitmapCache / fileUrlCache /
 * eventResourceCache / imageDimensionsCache) is a shared module-level cache also used by the
 * normal on-demand render path, keyed by File/path identity - so a cache warmed here is a
 * cache hit later, regardless of which world/resolution/status the user actually visits first.
 *
 * Memory discipline: each world's parsed worldmap.json is held only in a local variable for the
 * duration of that world's own preload pass, then falls out of scope - this module never
 * accumulates every world's parsed JSON simultaneously, only ever the one currently in flight.
 */
import { MapConfigObject, MapEventNode, WorldMapEventStatus } from '../../domain/types';
import { State, eventNodeRuntimeMap, imageDimensionsCache } from '../state';
import { getResDirName } from '../../utils/constants';
import { loadWorldMapConfig, rebuildWorldAssets, resolveResourceWorldIdentity } from './manifest';
import { findPieceAnim } from './find';
import { compileAnimAssets, getObjectUrlCached, loadCustomFontIfNeeded } from './index';
import {
    clearMaxImageIdCache,
    fetchWorldMapListAnimationDelays,
    fetchWorldMapListAnimationDetails,
    fetchWorldMapListEntryPoint,
    fetchWorldMapListLastLevel,
} from '../worldMeta';
import { resolveEventResources } from '../../events/resolveEventResources';
import { preloadWorldPathAssets } from '../../render/MapRenderer';
import { warmEventResources } from '../../render/EventLoader';

/** Only these two - the entire set the texture-res dropdown can ever select. */
const PRELOAD_RESOLUTIONS: readonly number[] = [1536, 768];

const STATUSES_TO_WARM: readonly WorldMapEventStatus[] = [
    WorldMapEventStatus.locked,
    WorldMapEventStatus.unlocked,
    WorldMapEventStatus.cleared,
];

export type MapAssetPreloadProgress = (phase: string, current: number, total: number) => void;

/** Loads one File into an <img> once (populating the browser's own decode cache for that blob
 * URL) and records its natural dimensions into imageDimensionsCache - the exact same cache
 * PieceLoader.loadStaticImage()'s cache-hit path already reads from. Never rejects: a single
 * corrupt/unreadable file should skip, not abort the whole preload pass. */
function preloadImageDimensions(file: File): Promise<void> {
    if (imageDimensionsCache.has(file)) return Promise.resolve();
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            imageDimensionsCache.set(file, { width: img.width, height: img.height });
            resolve();
        };
        img.onerror = () => resolve();
        img.src = getObjectUrlCached(file);
    });
}

/** Runs `items` through `worker` in fixed-size concurrent batches, yielding to the caller's
 * onBatchDone (used to report progress + let the loading overlay stay responsive) between
 * batches rather than firing thousands of promises at once. */
async function runInBatches<T>(
    items: T[],
    batchSize: number,
    worker: (item: T) => Promise<void>,
    onBatchDone?: (doneCount: number) => void
): Promise<void> {
    let done = 0;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(
            batch.map((item) =>
                worker(item).catch((e) => {
                    console.warn('[MapAssetPreload] item failed, skipping', e);
                })
            )
        );
        done += batch.length;
        onBatchDone?.(done);
    }
}

/**
 * Warms every static island image + animation folder available for `worldName` at whatever
 * resolution State.data.textureResolution currently holds. Covers mapPiece AND doodad in one
 * pass since both draw from the same per-world file pool (see render/PieceLoader.ts and
 * events/resolvers/doodad.ts - identical islandN.png / animN lookup).
 */
async function preloadWorldPieceAssets(worldName: string): Promise<void> {
    const assets = State.data.worlds[worldName];

    // ---- Static islandN.png files ----
    if (assets?.images) {
        const files = Object.values(assets.images);
        await runInBatches(files, 24, (file) => preloadImageDimensions(file));
    }

    // ---- Animation folders: worldmap/<ResDir>/animN/ (intl linear) or .../anim_<world>N/
    // (intl non-linear AND China, which always uses this suffix - see findPieceAnim in find.ts).
    // No China branch needed here: the second regex below matches the anim_<world>N/ folder
    // *suffix* regardless of what directory structure precedes it, and China's
    // {worldname}/worldmap/anim_{worldname}N/ layout ends in exactly that suffix. resDirLower is
    // only consulted by the first (international-linear-only) branch.
    const resDirLower = getResDirName(worldName).toLowerCase();
    const worldLower = worldName.toLowerCase();
    const animIndices = new Set<number>();

    for (const dir of State.data.filesByDir.keys()) {
        const d = dir.replace(/\\/g, '/');
        let m = d.match(/\/worldmap\/([^/]+)\/anim(\d+)\/$/i);
        if (m && m[1].toLowerCase() === resDirLower) {
            animIndices.add(parseInt(m[2], 10));
            continue;
        }
        m = d.match(/\/anim_([a-z0-9_]+?)(\d+)\/$/i);
        if (m && m[1].toLowerCase() === worldLower) {
            animIndices.add(parseInt(m[2], 10));
        }
    }

    await runInBatches(Array.from(animIndices), 16, async (animIndex) => {
        const anim = findPieceAnim(worldName, animIndex);
        if (!anim || !anim.json || !anim.files.length) return;
        await compileAnimAssets(anim);
    });
}

/**
 * Warms resolveEventResources() for every node in `config.objdata.m_eventList`, across every
 * status a node could actually be shown under later (double-click cycling, unlockAll). Doodad
 * nodes skip the status fan-out entirely since resolveDoodadResources() never branches on
 * status - warming it once is enough. Caller must already have State.data.mapConfig,
 * State.data.selectedWorld and State.data.textureResolution set to match `worldName` before
 * calling, since resolveEventResources reads all three ambiently.
 */
async function preloadWorldEventResources(worldName: string, config: MapConfigObject): Promise<void> {
    const eventList = config.objdata?.m_eventList || [];
    if (eventList.length === 0) return;

    await runInBatches(eventList, 20, async (node: MapEventNode) => {
        const isDoodad = node.m_eventType === 'doodad';
        const isBoss = node.m_eventType === 'level' && node.m_levelNodeType === 'boss';
        const isBossType =
            node.m_eventType === 'level' &&
            (node.m_levelNodeType === 'boss' || node.m_levelNodeType === 'nonfinalboss');
        const statuses = isDoodad ? [WorldMapEventStatus.locked] : STATUSES_TO_WARM;
        // Fan out stage/hologram flags so either hierarchy outcome hits a warm cache.
        const zombossVariants = isBoss ? [true, false] : [undefined];
        const hologramVariants = isBossType ? [true, false] : [undefined];

        for (const status of statuses) {
            for (const renderZombossNode of zombossVariants) {
                for (const renderHologramNode of hologramVariants) {
                    eventNodeRuntimeMap.set(node, {
                        wmed: { W: 0, E: 0, S: status },
                        renderZombossNode,
                        renderHologramNode,
                    });
                    const resources = await resolveEventResources(node, worldName);
                    // resolveEventResources only resolves WHICH file/animData each resource points at
                    // (and caches that decision) - it never decodes pixels. warmEventResources is the same
                    // function loadAnimationToElement/loadImageToElement call at real render time to
                    // actually compile/decode a resource; calling it here means that work happens now,
                    // not on the first real render of this node under this status/resolution.
                    await warmEventResources(resources);
                }
            }
        }
    });
}

/**
 * Preloads every mapPiece/doodad/event-node asset for every discovered world, at both texture
 * resolutions. Must run before the user has selected a world (Start Viewer, before the intro
 * modal is hidden) - it temporarily repoints State.data.{textureResolution,selectedWorld,
 * mapConfig,worlds} to walk each world in turn and restores a clean "nothing selected" slate
 * in the `finally` block.
 */
export async function preloadAllMapAssets(onProgress?: MapAssetPreloadProgress): Promise<void> {
    const worlds = State.data.availableWorlds;
    if (worlds.length === 0) return;

    const savedResolution = State.data.textureResolution;
    const savedSelectedWorld = State.data.selectedWorld;
    const savedMapConfig = State.data.mapConfig;

    const totalUnits = worlds.length * PRELOAD_RESOLUTIONS.length;
    let unitsDone = 0;
    onProgress?.('map-assets', 0, totalUnits);

    try {
        // These three are each memoized as a single global (not per-world) cache, and were
        // previously only warmed as a side effect of specific resolvers happening to call them
        // (doodad.ts for the delay/detail maps, level.ts/keyGate.ts's display-text rendering for
        // the custom font) - correct in practice since preload below touches virtually every node
        // type, but relying on "some node somewhere happens to trigger it" is fragile. Warming them
        // explicitly up front removes that assumption entirely.
        await Promise.all([
            loadCustomFontIfNeeded(),
            fetchWorldMapListAnimationDelays(),
            fetchWorldMapListAnimationDetails(),
        ]);

        for (const rawWorldName of worlds) {
            const worldName = resolveResourceWorldIdentity(rawWorldName);

            // Also memoized globally (all worlds share one parsed worldmaplist.json under the hood),
            // but keyed per-world - cheap regardless since the underlying JSON parse above is what
            // actually costs anything, this just walks the already-parsed structure once per world so
            // renderMap's "was the last level naturally cleared" check never has to do it cold.
            try {
                await Promise.all([
                    fetchWorldMapListEntryPoint(rawWorldName),
                    fetchWorldMapListLastLevel(rawWorldName),
                ]);
            } catch (e) {
                console.warn('[MapAssetPreload] worldmaplist.json lookup failed for', rawWorldName, e);
            }

            // Parsed once per world, held only in this local for the duration of this iteration -
            // never stashed anywhere retained, so we don't accumulate every world's JSON at once.
            // Reset selectedWorld/mapConfig first: loadWorldMapConfig() short-circuits to whatever
            // is already in State.data.mapConfig when selectedWorld already matches the resolved
            // identity, and rift-family worlds (rift1, rift2, ...) all resolve to the same 'twister'
            // identity while each still has its own distinct worldmap.json - without this reset the
            // second rift world in the loop would incorrectly get handed the first one's config back.
            State.data.selectedWorld = null;
            State.data.mapConfig = null;
            let config: MapConfigObject | null = null;
            try {
                config = await loadWorldMapConfig(rawWorldName);
            } catch (e) {
                console.warn('[MapAssetPreload] failed to load worldmap.json for', rawWorldName, e);
            }

            for (const res of PRELOAD_RESOLUTIONS) {
                State.data.textureResolution = res;
                State.data.selectedWorld = worldName;
                State.data.mapConfig = config;

                // Boundary is memoized as a single (non-per-world) value - must invalidate before
                // recomputing for a different world, or later worlds would reuse an earlier one's
                // static/animation cutoff.
                clearMaxImageIdCache();
                rebuildWorldAssets();

                await preloadWorldPieceAssets(worldName);
                if (config) {
                    await preloadWorldEventResources(worldName, config);
                }
                await preloadWorldPathAssets(worldName);

                unitsDone++;
                onProgress?.('map-assets', unitsDone, totalUnits);
            }
        }
    } finally {
        // Nothing should look pre-selected once Start Viewer hands off to the (still-empty) editor
        // - the user picks a world explicitly next.
        State.data.textureResolution = savedResolution;
        State.data.selectedWorld = savedSelectedWorld;
        State.data.mapConfig = savedMapConfig;
        State.data.worlds = {};
        clearMaxImageIdCache();
    }
}