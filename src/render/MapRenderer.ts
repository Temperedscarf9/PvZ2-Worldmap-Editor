/**
 * Orchestrates a full (or incremental "eventOnly") render pass: walks the current world's
 * m_mapPieces + m_eventList, resolves each into DOM via PieceLoader/EventLoader/PathRenderer,
 * and mounts everything into the five covering-layer container grids (see ./layers.ts).
 */
import { findAnimInGlobal, findFileInGlobal, getObjectUrlCached, compileAnimAssets, findPieceAnim } from '../core/resources';
import {
  MapConfigObject,
  MapEventNode,
  PieceInfo,
  EventPieceInfo,
  WorldMapEventStatus,
  EventResourceDef,
} from '../domain/types';
import { State, pieceRuntimeMap, eventNodeRuntimeMap, imageDimensionsCache } from '../core/state';
import { CONFIG } from '../utils/constants';
import {
  fetchWorldMapListEntryPoint,
  fetchWorldMapListLastLevel,
  customEventStatusMap,
  customCMap,
  lastLoadedWorld,
  cachedSelectedWorldLastLevel,
  clearMaxImageIdCache,
  getWorldAnimationBoundary,
  setLastLoadedWorld,
  setCachedSelectedWorldLastLevel,
  setIsLastLevelNaturallyClearedGlobal,
  getParsedWorldMapList,
} from '../core/worldMeta';
import { resolveEventResources } from '../events/resolveEventResources';
import { loadPiece } from './PieceLoader';
import {
  loadEventPiecesForNode,
  attachStarsToElement,
  shouldRenderZombossNode,
  shouldRenderHologramNode,
  warmEventResources,
} from './EventLoader';
import {
  PathPieceInfo,
  activePathPieces,
  findPathTextureFile,
  loadSingleImage,
} from './PathRenderer';
import { clampParallax, clampDrawLayer } from './layers';
import { LayerStack, bindLayerStack, tryGetLayerStack } from '../scene/LayerStack';
import { SceneGraph } from '../scene/SceneGraph';
import { PathFactory } from '../scene/factories/PathFactory';
import { EventFactory } from '../scene/factories/EventFactory';
import { applyHitboxCssVar } from '../utils/scale';

export function getNextZIndexInContainer(container: HTMLElement): number {
  const stack = tryGetLayerStack();
  if (stack) return stack.nextZ(container);
  let max = 0;
  for (let i = 0; i < container.children.length; i++) {
    const z = parseInt((container.children[i] as HTMLElement).style.zIndex || '0', 10);
    if (!isNaN(z) && z > max) max = z;
  }
  return max + 1;
}

function clampLayerPair(parallaxLayer: number, drawLayer: number): { pl: number; dl: number } {
  return { pl: clampParallax(parallaxLayer), dl: clampDrawLayer(drawLayer) };
}

/** Live-mount path: always goes through LayerStack (created on demand if missing). */
function ensureStack(parent?: HTMLElement): LayerStack {
  let stack = tryGetLayerStack();
  if (!stack) {
    const root = parent || (document.getElementById('map-container') as HTMLElement);
    stack = new LayerStack(root);
    bindLayerStack(stack);
  }
  return stack;
}

export function getOrCreatePieceLayerContainer(parallaxLayer: number, drawLayer: number): HTMLElement {
  return ensureStack().getMapDrawContainer(parallaxLayer, drawLayer);
}

export function getOrCreateEventLayerContainer(parallaxLayer: number, drawLayer: number): HTMLElement {
  return ensureStack().getEventDrawContainer(parallaxLayer, drawLayer);
}

export function clearPlayers(): void {
  // Path players first (detach removes them from State.players), then the rest.
  // Avoid double-destroy: PathFactory.clear destroys path players before we wipe the array.
  PathFactory.clear();
  State.players.forEach((p) => p.destroy());
  State.players = [];
}

let activeRenderTaskId = 0;

export function cancelActiveRender(): void {
  activeRenderTaskId++;
}

/** Loads a File, resolving once it has decoded - used by preloadWorldResources for plain (non-anim) images. */
const PATH_TILE_FILENAMES = [
  'empty_ur_dl.png',
  'empty_ul_dr.png',
  'empty_ul_ur_dr.png',
  'empty_ul_ur_dl.png',
  'empty_ur_dl_dr.png',
  'empty_ul_dl_dr.png',
  'locked.png',
  'grass_light.png',
  'grass_dark.png',
];

/**
 * Warms path-connector assets for `worldName` at whatever resolution
 * State.data.textureResolution currently holds - star icons, the non-linear grid-tile PNG set,
 * and (linear mode only) the beam-path animation folder. Split out from preloadWorldResources
 * (which additionally re-touches this world's pieces/events, redundant work once Start preload
 * has already covered every world) so Start-time preload can warm every world's path assets
 * without paying that redundant cost N times.
 */
export async function preloadWorldPathAssets(worldName: string): Promise<void> {
  const isChina = State.data.isChinaVersion;
  const resolution = State.data.textureResolution;
  // China: images/{res}/UICommon/worldmap/common/star(_empty).png - dynamic resolution per the
  // given spec, unlike international's (pre-existing, left as-is) hardcoded 1536 tier.
  const starFile = isChina
      ? findFileInGlobal(`images/${resolution}/UICommon/worldmap/common/star.png`)
      : findFileInGlobal('images/1536/initial/worldmap/common/star.png');
  const starEmptyFile = isChina
      ? findFileInGlobal(`images/${resolution}/UICommon/worldmap/common/star_empty.png`)
      : findFileInGlobal('images/1536/initial/worldmap/common/star_empty.png');

  const tasks: Promise<unknown>[] = [starFile, starEmptyFile].map((f) =>
      f ? loadSingleImage(f) : Promise.resolve(null)
  );

  if (State.data.isLinear) {
    // China: images/{res}/UICommon/worldmap/map_path/ vs intl images/{res}/initial/worldmap/map_path/
    const pathAnimData = findAnimInGlobal(
        `images/${resolution}/${isChina ? 'UICommon' : 'initial'}/worldmap/map_path/`
    );
    if (pathAnimData) tasks.push(compileAnimAssets(pathAnimData));
  } else {
    tasks.push(
        ...PATH_TILE_FILENAMES.map((fname) => {
          const file = findPathTextureFile(worldName, fname);
          return file ? loadSingleImage(file) : Promise.resolve(null);
        })
    );
  }

  await Promise.all(tasks);
}

export async function preloadWorldResources(worldName: string, config: MapConfigObject, resolution: number): Promise<void> {
  await getParsedWorldMapList();

  const worldDataValue = config.objdata;
  const maxImageId = getWorldAnimationBoundary();
  const sortedPieces = worldDataValue.m_mapPieces || [];

  const piecePromises = sortedPieces.map(async (piece) => {
    const assets = State.data.worlds[worldName];
    if (!assets) return;
    const imageId = piece.m_imageID ?? 0;
    const isAnimation = imageId > maxImageId;

    if (!isAnimation) {
      let minI = 1;
      for (const filename of Object.keys(assets.images)) {
        const m = filename.match(/^island(\d+)\.png$/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num < minI) minI = num;
        }
      }
      const offset = minI === 0 ? 0 : 1;
      const fileName = `${CONFIG.filePrefix}${imageId + offset}${CONFIG.fileExt}`;
      const file = assets.images[fileName];
      if (file && !imageDimensionsCache.has(file)) {
        const url = getObjectUrlCached(file);
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageDimensionsCache.set(file, { width: img.width, height: img.height });
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        });
      }
    } else {
      const animIndex = imageId - maxImageId;
      const anim = findPieceAnim(worldName, animIndex);
      if (anim && anim.json && anim.files.length) {
        await compileAnimAssets(anim);
      }
    }
  });

  const eventList = State.data.isMapOnly
      ? (worldDataValue.m_eventList || []).filter((n) => n.m_eventType === 'doodad')
      : (worldDataValue.m_eventList || []);
  const eventPromises = eventList.map(async (node) => {
    const resources = await resolveEventResources(node, worldName);
    if (!resources) return;
    await warmEventResources(resources);
  });

  await Promise.all([
    Promise.all(piecePromises),
    Promise.all(eventPromises),
    preloadWorldPathAssets(worldName),
  ]);
}

export async function renderMap(
    mapContainer: HTMLDivElement,
    emptyBorder: HTMLDivElement,
    resetCameraCallback: () => void,
    options: { eventOnly?: boolean; resetCamera?: boolean } = {}
): Promise<void> {
  if (!State.data.mapConfig || !State.data.selectedWorld) return;

  const myTaskId = ++activeRenderTaskId;
  const isInterrupted = () => myTaskId !== activeRenderTaskId;
  const resolution = State.data.textureResolution;
  applyHitboxCssVar(resolution);
  const isLinear = State.data.isLinear;

  if (!options.eventOnly) {
    clearMaxImageIdCache();
  }
  const maxImageId = getWorldAnimationBoundary();
  const isEventOnly = options.eventOnly === true && State.data.eventContainer;

  const renderTarget = isEventOnly ? mapContainer : document.createElement('div');

  if (isEventOnly) {
    // In-place updating is handled later dynamically
  } else {
    clearPlayers();
    emptyBorder.style.display = 'none';
    State.data.pieces = [];
    State.data.eventPieces = [];
    pieceRuntimeMap.clear();
    // Tear previous layer hosts; a new LayerStack is bound in the mount phase below.
    const prev = tryGetLayerStack();
    prev?.clear();
    bindLayerStack(null);
  }

  const worldDataValue = State.data.mapConfig.objdata;
  const worldId: number = worldDataValue.m_worldId || 1;

  if (!isEventOnly && worldDataValue.m_boundingRect) {
    State.data.boxLeft = (worldDataValue.m_boundingRect.mX * State.data.textureResolution) / 600;
  }

  let eventList = worldDataValue.m_eventList || [];

  if (lastLoadedWorld !== State.data.selectedWorld) {
    customEventStatusMap.clear();
    customCMap.clear();
    setLastLoadedWorld(State.data.selectedWorld);
    setCachedSelectedWorldLastLevel(await fetchWorldMapListLastLevel(State.data.selectedWorld || ''));
  }

  // Populate defaults into customEventStatusMap if not present
  for (const evt of eventList) {
    if (!customEventStatusMap.has(evt.m_eventId)) {
      customEventStatusMap.set(evt.m_eventId, WorldMapEventStatus.locked);
    }
  }

  // Dynamically resolve entry point node using EntryPoint in worldmaplist.json
  const entryPointName = await fetchWorldMapListEntryPoint(State.data.selectedWorld || '');
  let foundEntryPoint = false;

  if (entryPointName) {
    for (const evt of eventList) {
      if (evt.m_name === entryPointName && customEventStatusMap.get(evt.m_eventId) === WorldMapEventStatus.locked) {
        customEventStatusMap.set(evt.m_eventId, WorldMapEventStatus.unlocked);
        foundEntryPoint = true;
      }
    }
  }

  if (!foundEntryPoint) {
    // Fallback to defaults if EntryPoint isn't available or matching
    if (customEventStatusMap.get(1) === WorldMapEventStatus.locked) {
      customEventStatusMap.set(1, WorldMapEventStatus.unlocked);
    }
    for (const evt of eventList) {
      if (evt.m_name === 'tutorial_level_intro1' && customEventStatusMap.get(evt.m_eventId) === WorldMapEventStatus.locked) {
        customEventStatusMap.set(evt.m_eventId, WorldMapEventStatus.unlocked);
      }
    }
  }

  const isLastLevelNaturallyCleared = (() => {
    if (State.data.unlockAll) return true;
    if (!cachedSelectedWorldLastLevel) return false;
    for (const evt of eventList) {
      if (evt.m_name === cachedSelectedWorldLastLevel) {
        return customEventStatusMap.get(evt.m_eventId) === WorldMapEventStatus.cleared;
      }
    }
    return false;
  })();

  setIsLastLevelNaturallyClearedGlobal(isLastLevelNaturallyCleared);

  const getLevelStarLimitAndCount = (node: MapEventNode) => {
    const isChallenge = node.m_isChallengeType === true;

    if (isChallenge) {
      const max_stars = 1;
      const earned_stars = State.data.unlockAll ? 1 : (customCMap.get(node.m_eventId) ?? 0);
      return { max_stars, earned_stars };
    } else {
      if (isLastLevelNaturallyCleared || State.data.unlockAll) {
        const max_stars = 3;
        const earned_stars = State.data.unlockAll ? 3 : (customCMap.get(node.m_eventId) ?? 0);
        return { max_stars, earned_stars };
      } else {
        return { max_stars: 0, earned_stars: 0 };
      }
    }
  };

  const getEventStatus = (eventId: number): WorldMapEventStatus => {
    if (State.data.unlockAll) {
      return WorldMapEventStatus.cleared;
    }
    return customEventStatusMap.get(eventId) ?? WorldMapEventStatus.locked;
  };

  for (const evt of eventList) {
    const status = getEventStatus(evt.m_eventId);
    const { earned_stars } = getLevelStarLimitAndCount(evt);
    const C = Math.pow(2, earned_stars) - 1;

    eventNodeRuntimeMap.set(evt, {
      wmed: {
        W: worldId,
        E: evt.m_eventId,
        S: status,
        C: C,
      },
    });
  }

  // Stage: only among m_levelNodeType === 'boss' (child/grandchild check).
  if (isLinear) {
    const bossNodes = eventList.filter(
      (n: MapEventNode) => n.m_eventType === 'level' && n.m_levelNodeType === 'boss'
    );
    bossNodes.forEach((n: MapEventNode) => {
      const runtime = eventNodeRuntimeMap.get(n) || {
        wmed: { W: worldId, E: n.m_eventId, S: WorldMapEventStatus.locked },
      };
      runtime.renderZombossNode = shouldRenderZombossNode(n, bossNodes, eventList);
      eventNodeRuntimeMap.set(n, runtime);
    });
  }

  // Hologram: on unlocked/cleared parent chain, only the lowest boss|nonfinalboss.
  // A→B→C all cleared ⇒ only C. locked ⇒ never.
  {
    const getStatus = (n: MapEventNode) =>
      eventNodeRuntimeMap.get(n)?.wmed.S ?? WorldMapEventStatus.locked;
    for (const n of eventList) {
      if (
        n.m_eventType !== 'level' ||
        (n.m_levelNodeType !== 'boss' && n.m_levelNodeType !== 'nonfinalboss')
      ) {
        continue;
      }
      const runtime = eventNodeRuntimeMap.get(n) || {
        wmed: { W: worldId, E: n.m_eventId, S: WorldMapEventStatus.locked },
      };
      runtime.renderHologramNode = shouldRenderHologramNode(n, eventList, getStatus);
      eventNodeRuntimeMap.set(n, runtime);
    }
  }

  if (isEventOnly) {
    // Non-linear: rebuild grid tiles. Linear: leave beams in place — only labels update below.
    if (!isLinear && State.data.selectedWorld) {
      await PathFactory.rebuildGridForEventOnly(
        eventList,
        State.data.selectedWorld,
        isInterrupted
      );
      if (isInterrupted()) return;
    }

    const existingPieceMap = new Map<string, EventPieceInfo>();
    State.data.eventPieces.forEach((p) => {
      const suffix = p.isZombossStage ? '_stage' : '_top';
      existingPieceMap.set(p.node.m_eventId + suffix, p);
    });

    // Resolve every node's target resources concurrently first (resolveEventResources is a
    // pure, self-cached lookup - see events/resolveEventResources.ts - so nodes don't interfere
    // with each other). The loop below then only does synchronous compatibility-diff/DOM work,
    // which must stay in list order for correct z-index/stacking, but no longer serializes on
    // network/decode-bound resolution one node at a time.
    const resolvedResourcesByNode = new Map<MapEventNode, EventResourceDef[]>();
    await Promise.all(
        eventList.map(async (node) => {
          const resources = await resolveEventResources(node, State.data.selectedWorld || '');
          resolvedResourcesByNode.set(node, resources);
        })
    );
    if (isInterrupted()) return;

    // Per-node work (compatibility diff + player update / in-place rebuild / fresh mount) has
    // no cross-node DOM-ordering dependency EXCEPT for brand-new pieces (no existingPiece yet
    // this render), whose first-time container append + z-index assignment must happen in
    // original list order to match what a full render would produce. So every node's async
    // work runs concurrently; "needs first-time append" results are collected separately and
    // appended (only those, still in original order) in one sequential pass afterward. This
    // preserves the exact ordering guarantee while no longer serializing the "just update this
    // node in place" case that dominates something like an unlockAll toggle touching every node
    // in the world at once.
    type PendingAppend = { element: HTMLDivElement; container: HTMLElement };
    const activeEventsList: EventPieceInfo[] = [];

    const perNodeResults = await Promise.all(
        eventList.map(async (node): Promise<{ active: EventPieceInfo[]; pendingAppends: PendingAppend[] }> => {
          if (isInterrupted()) return { active: [], pendingAppends: [] };
          const targetResources = resolvedResourcesByNode.get(node) || [];

          const isBossNode = node.m_eventType === 'level' && node.m_levelNodeType === 'boss';
          const isDanger = node.m_dataString?.endsWith('dangerroom');
          const active: EventPieceInfo[] = [];
          const pendingAppends: PendingAppend[] = [];

          async function handleOne(
              resources: EventResourceDef[],
              existingPiece: EventPieceInfo | undefined,
              isStageConfig: boolean,
              allowStars: boolean
          ): Promise<void> {
            if (resources.length === 0 && isBossNode) return; // boss stage/top may legitimately be empty

            if (existingPiece) {
              if (EventFactory.resourcesCompatible(existingPiece.resources, resources)) {
                EventFactory.applyLabelsInPlace(existingPiece, resources);
                if (allowStars) {
                  const oldStars = existingPiece.element.querySelectorAll('.star-icon-piece');
                  oldStars.forEach((s) => s.remove());
                  const targetEl =
                    existingPiece.element.querySelector('.event-visual-wrapper') || existingPiece.element;
                  await attachStarsToElement(targetEl as HTMLDivElement, node);
                }
                active.push(existingPiece);
              } else {
                const ok = await EventFactory.rebuildContentsInPlace(existingPiece, node, resources, {
                  allowStars,
                  isInterrupted,
                });
                if (!ok) return;
                active.push(existingPiece);
              }
            } else {
              const newPieces = await loadEventPiecesForNode(node);
              if (isInterrupted()) {
                newPieces.forEach(p => p?.players?.forEach(pl => pl.destroy()));
                return;
              }
              const match = isBossNode ? newPieces.find(p => p.isZombossStage === isStageConfig) : newPieces[0];
              if (match) {
                const targetContainer = isBossNode
                    ? (isStageConfig ? State.data.zombossContainer : State.data.eventContainer)
                    : getOrCreateEventLayerContainer(node.m_parallaxLayer || 0, node.m_drawLayer || 0);
                if (targetContainer) {
                  pendingAppends.push({ element: match.element, container: targetContainer });
                  active.push(match);
                }
              }
            }
          }

          if (isBossNode) {
            const stageRes = targetResources.filter(r => r.type === 'animation' && r.animData?.path.includes('zomboss_node_') && !r.animData.path.includes('hologram'));
            const topRes = targetResources.filter(r => !(r.type === 'animation' && r.animData?.path.includes('zomboss_node_') && !r.animData.path.includes('hologram')));
            await handleOne(stageRes, existingPieceMap.get(node.m_eventId + '_stage'), true, false);
            await handleOne(topRes, existingPieceMap.get(node.m_eventId + '_top'), false, State.data.isLinear === false && !isDanger);
          } else {
            const isLevelNode = node.m_eventType === 'level';
            await handleOne(
                targetResources,
                existingPieceMap.get(node.m_eventId + '_top'),
                false,
                isLevelNode && State.data.isLinear === false && !isDanger
            );
          }

          return { active, pendingAppends };
        })
    );

    if (isInterrupted()) return;

    // Sequential pass, in original list order: only brand-new pieces land here (see comment
    // above), so this is normally a tiny or empty list even for a world-wide status toggle.
    for (const { pendingAppends } of perNodeResults) {
      for (const { element, container } of pendingAppends) {
        element.style.zIndex = String(getNextZIndexInContainer(container));
        container.appendChild(element);
      }
    }
    for (const { active } of perNodeResults) {
      activeEventsList.push(...active);
      // Brand-new pieces (no prior shell) were never in State.players — register once.
      for (const piece of active) {
        if (!existingPieceMap.has(piece.node.m_eventId + (piece.isZombossStage ? '_stage' : '_top'))) {
          piece.players?.forEach((pl) => {
            if (State.players.indexOf(pl) === -1) State.players.push(pl);
          });
        }
      }
    }

    const activeEventIds = new Set(activeEventsList.map((p) => p.node.m_eventId));
    State.data.eventPieces.forEach((p) => {
      if (!activeEventIds.has(p.node.m_eventId)) {
        p.element?.parentNode?.removeChild(p.element);
        p.players?.forEach((pl) => {
          pl.destroy();
          const glIdx = State.players.indexOf(pl);
          if (glIdx !== -1) {
            State.players.splice(glIdx, 1);
          }
        });
      }
    });

    const layerA_isEventOnly = activeEventsList
        .filter(p => p.isZombossStage === true)
        .sort((a, b) =>
            (a.node.m_position?.y ?? 0) - (b.node.m_position?.y ?? 0) ||
            (a.node.m_position?.x ?? 0) - (b.node.m_position?.x ?? 0)
        );
    const layerD_isEventOnly = activeEventsList.filter(p => p.isZombossStage !== true);

    // Zomboss Stage Layer, Map Path Layer, and Event Layer are three independent containers
    // (each its own stacking context via LAYER_Z) - each gets its own small sequential z-index,
    // entirely independent of the other two and of Map Pieces/Doodad layers.
    if (State.data.zombossContainer) {
      let z = 1;
      layerA_isEventOnly.forEach((p) => {
        p.element.style.zIndex = String(z++);
        State.data.zombossContainer!.appendChild(p.element);
      });
    }
    if (State.data.pathContainer) {
      let z = 1;
      activePathPieces.forEach((path) => {
        path.element.style.zIndex = String(z++);
        State.data.pathContainer!.appendChild(path.element);
      });
    }
    const eventByContainer = new Map<HTMLElement, typeof layerD_isEventOnly>();
    for (const p of layerD_isEventOnly) {
      const container = getOrCreateEventLayerContainer(p.node.m_parallaxLayer || 0, p.node.m_drawLayer || 0);
      if (!eventByContainer.has(container)) eventByContainer.set(container, []);
      eventByContainer.get(container)!.push(p);
    }
    eventByContainer.forEach((group, container) => {
      group.sort(
          (a, b) =>
              (a.node.m_position?.y ?? 0) - (b.node.m_position?.y ?? 0) ||
              (a.node.m_position?.x ?? 0) - (b.node.m_position?.x ?? 0)
      );
      let z = 1000;
      group.forEach(p => {
        p.element.style.zIndex = String(z++);
        container.appendChild(p.element);
      });
    });

    State.data.eventPieces = [...layerA_isEventOnly, ...layerD_isEventOnly];

    for (const path of activePathPieces) {
      if (path.player) {
        const startNodeRuntime = eventNodeRuntimeMap.get(path.toNode!);
        const startNodeStatus = startNodeRuntime?.wmed?.S;
        const pathLabel = startNodeStatus === WorldMapEventStatus.cleared ? 'beam_path_open' : 'beam_path_on';
        if (path.player.getCurrentLabel() !== pathLabel) {
          path.player.playLabel(pathLabel, true, path.randomOffset);
        }
      }
    }

    // Map Only hides Zomboss Stage / Map Path / Event layers wholesale (Map Pieces and Doodad
    // stay visible) - toggling the three layer-root containers once is equivalent to, and far
    // cheaper than, touching every individual element.
    tryGetLayerStack()?.setMapOnly(State.data.isMapOnly);
    return;
  }

  const eventResults_nested = await Promise.all(eventList.map((n: MapEventNode) => loadEventPiecesForNode(n)));
  if (isInterrupted()) {
    eventResults_nested.flat().forEach(piece => {
      piece?.players?.forEach(p => {
        p.destroy();
        const glIdx = State.players.indexOf(p);
        if (glIdx !== -1) State.players.splice(glIdx, 1);
      });
    });
    return;
  }

  const eventResults = eventResults_nested.flat();

  const layerA = eventResults.filter(p => p.isZombossStage === true);
  const layerD = eventResults.filter(p => p.isZombossStage !== true); // 含 doodad

  const layerA_sorted = layerA.sort(
      (a, b) =>
          (a.node.m_position?.y ?? 0) - (b.node.m_position?.y ?? 0) ||
          (a.node.m_position?.x ?? 0) - (b.node.m_position?.x ?? 0)
  );

  const layerD_sorted = layerD.sort(
      (a, b) =>
          (a.node.m_position?.y ?? 0) - (b.node.m_position?.y ?? 0) ||
          (a.node.m_position?.x ?? 0) - (b.node.m_position?.x ?? 0)
  );

  // Final paint order is entirely determined by which (parallaxLayer, drawLayer) container an
  // element lands in, plus its position sort within that container (see buildGridLayer below) -
  // so sorting m_mapPieces by parallaxLayer/drawLayer here first has no effect on the outcome.
  const sortedPieces = [...worldDataValue.m_mapPieces!].sort(
      (a: MapEventNode, b: MapEventNode) =>
          (a.m_position?.y || 0) - (b.m_position?.y || 0) ||
          (a.m_position?.x || 0) - (b.m_position?.x || 0)
  );

  const results = await Promise.all(sortedPieces.map((p) => loadPiece(p, maxImageId)));
  if (isInterrupted()) {
    results.forEach(res => {
      if (res?.player) {
        res.player.destroy();
        const glIdx = State.players.indexOf(res.player);
        if (glIdx !== -1) State.players.splice(glIdx, 1);
      }
    });
    eventResults.forEach(piece => {
      piece?.players?.forEach(p => {
        p.destroy();
        const glIdx = State.players.indexOf(p);
        if (glIdx !== -1) State.players.splice(glIdx, 1);
      });
    });
    return;
  }
  const orderedPieces = results.filter((p): p is PieceInfo => p !== null);

  // Path compile (no mount yet — LayerStack is created below)
  let resolvedPaths: PathPieceInfo[] = [];
  const worldNameForPath = State.data.selectedWorld;
  if (worldNameForPath) {
    resolvedPaths = await PathFactory.compile(eventList, worldNameForPath, isInterrupted);
    if (isInterrupted()) {
      resolvedPaths.forEach((p) => p.player?.destroy());
      results.forEach((res) => {
        if (res?.player) {
          res.player.destroy();
          const glIdx = State.players.indexOf(res.player);
          if (glIdx !== -1) State.players.splice(glIdx, 1);
        }
      });
      eventResults.forEach((piece) => {
        piece?.players?.forEach((p) => {
          p.destroy();
          const glIdx = State.players.indexOf(p);
          if (glIdx !== -1) State.players.splice(glIdx, 1);
        });
      });
      return;
    }
  }

  // ---- Mount via LayerStack (true covering-layer model) ----
  // Build into renderTarget (detached fragment on full render), then swap into mapContainer.
  const usedParallaxLayers = new Set<number>([0]);
  for (const r of orderedPieces) {
    usedParallaxLayers.add(clampLayerPair(r.piece.m_parallaxLayer || 0, r.piece.m_drawLayer || 0).pl);
  }
  for (const e of layerD) {
    usedParallaxLayers.add(clampLayerPair(e.node.m_parallaxLayer || 0, e.node.m_drawLayer || 0).pl);
  }

  const stack = new LayerStack(renderTarget);
  bindLayerStack(stack);
  stack.prepareParallax(usedParallaxLayers);

  // 1. Islands / mapPieces — sort y,x within each (parallax, draw) bucket
  const piecesByKey = new Map<string, typeof orderedPieces>();
  for (const r of orderedPieces) {
    const { pl, dl } = clampLayerPair(r.piece.m_parallaxLayer || 0, r.piece.m_drawLayer || 0);
    const key = `${pl}_${dl}`;
    if (!piecesByKey.has(key)) piecesByKey.set(key, []);
    piecesByKey.get(key)!.push(r);
  }
  for (const [key, group] of piecesByKey) {
    const [pl, dl] = key.split('_').map(Number);
    const container = stack.getMapDrawContainer(pl, dl);
    const sorted = [...group].sort(
      (a, b) =>
        (a.piece.m_position?.y ?? 0) - (b.piece.m_position?.y ?? 0) ||
        (a.piece.m_position?.x ?? 0) - (b.piece.m_position?.x ?? 0)
    );
    let localZ = 1000;
    for (const r of sorted) {
      r.element.style.zIndex = String(localZ++);
      container.appendChild(r.element);
      State.data.pieces.push(r);
      if (r.player) State.players.push(r.player);
    }
  }

  // 2. Zomboss stages — always on parallax 0 covering root
  stack.ensureHost(0);
  if (stack.zomboss) {
    let z = 1;
    for (const e of layerA_sorted) {
      e.element.style.zIndex = String(z++);
      stack.zomboss.appendChild(e.element);
      State.data.eventPieces.push(e);
      e.players?.forEach((p) => State.players.push(p));
    }
  }

  // 3. Path tiles / beams — parallax 0 (PathFactory owns active list + players)
  stack.ensureHost(0);
  PathFactory.mountAll(resolvedPaths);

  // 4. Events + doodads — (parallax, draw) buckets, sort y,x
  const eventsByKey = new Map<string, typeof layerD>();
  for (const e of layerD) {
    const { pl, dl } = clampLayerPair(e.node.m_parallaxLayer || 0, e.node.m_drawLayer || 0);
    const key = `${pl}_${dl}`;
    if (!eventsByKey.has(key)) eventsByKey.set(key, []);
    eventsByKey.get(key)!.push(e);
  }
  for (const [key, group] of eventsByKey) {
    const [pl, dl] = key.split('_').map(Number);
    const container = stack.getEventDrawContainer(pl, dl);
    const sorted = [...group].sort(
      (a, b) =>
        (a.node.m_position?.y ?? 0) - (b.node.m_position?.y ?? 0) ||
        (a.node.m_position?.x ?? 0) - (b.node.m_position?.x ?? 0)
    );
    let localZ = 1000;
    for (const e of sorted) {
      e.element.style.zIndex = String(localZ++);
      container.appendChild(e.element);
      State.data.eventPieces.push(e);
      e.players?.forEach((p) => State.players.push(p));
    }
  }

  if (!isEventOnly && !isInterrupted()) {
    mapContainer.innerHTML = '';
    while (renderTarget.firstChild) {
      mapContainer.appendChild(renderTarget.firstChild);
    }
    stack.reparent(mapContainer);
  }

  stack.setMapOnly(State.data.isMapOnly);
  SceneGraph.attachBuiltRoots(mapContainer);

  if (options.resetCamera) {
    resetCameraCallback();
  }
}