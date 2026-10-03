/**
 * Renders the connecting path between event nodes: either the animated "linear" beam path
 * (one PamCanvasPlayer per edge) or the isometric grid-tile path used in non-linear worlds.
 */
import { PamCanvasPlayer } from '../pam/canvas-player';
import { computePathTransform } from '../utils/pathNodeMath';
import { Matrix, toGridCoords } from '../utils/mathTool';
import { MapEventNode, WorldMapEventStatus, DirectionMask, PathTile } from '../domain/types';
import { State, eventNodeRuntimeMap } from '../core/state';
import { getObjectUrlCached, compileAnimAssets, findFileInGlobal } from '../core/resources';

export interface PathPieceInfo {
  fromNode?: MapEventNode;
  toNode?: MapEventNode;
  element: HTMLDivElement;
  player?: PamCanvasPlayer;
  randomOffset?: number;
}

export let activePathPieces: PathPieceInfo[] = [];
export const pathImageCache = new Map<string, HTMLImageElement>();

export function clearPathImageCache(): void {
  pathImageCache.forEach((img) => {
    try {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute('src');
      img.src = '';
    } catch { /* ignore */ }
  });
  pathImageCache.clear();
}

/**
 * Refresh path visuals after a node move.
 * Linear: update beam transforms in place.
 * Non-linear: full sync grid rebuild via PathFactory (avoids duplicating mount logic here).
 *
 * Prefer PathFactory.refreshAfterMove() from editor code; this export is kept for
 * legacy imports and for PathFactory's internal linear transform pass.
 */
export function updatePathElements(): void {
  const isLinear = State.data.isLinear;
  const resolution = State.data.textureResolution;

  if (isLinear) {
    for (const path of activePathPieces) {
      if (path.fromNode && path.toNode && path.fromNode.m_position && path.toNode.m_position) {
        const trans = computePathTransform(
          path.fromNode.m_position.x,
          path.fromNode.m_position.y,
          path.toNode.m_position.x,
          path.toNode.m_position.y,
          resolution
        );
        path.element.style.transform = trans.transformStr;
      }
    }
    return;
  }

  // Non-linear: deferred to PathFactory to keep a single mount path through LayerStack.
  // Dynamic import avoided — callers should use PathFactory.refreshAfterMove().
  // Fallback if pathContainer still exists (mid-migration):
  const worldName = State.data.selectedWorld;
  const pathContainer = State.data.pathContainer;
  if (worldName && pathContainer && State.data.mapConfig) {
    const eventList = State.data.mapConfig.objdata.m_eventList || [];
    activePathPieces.forEach((path) => {
      path.element.parentNode?.removeChild(path.element);
    });
    activePathPieces = [];
    const newPaths = compileGridTilesSync(eventList, worldName, resolution);
    let z = 1;
    newPaths.forEach((path) => {
      path.element.style.zIndex = String(z++);
      pathContainer.appendChild(path.element);
      activePathPieces.push(path);
    });
  }
}

/** Replaces the whole active path-piece list; used by MapRenderer during a full render pass. */
export function setActivePathPieces(paths: PathPieceInfo[]): void {
  activePathPieces = paths;
}

export function detachActivePathPieces(): void {
  activePathPieces.forEach((path) => {
    if (path.element.parentNode) {
      path.element.parentNode.removeChild(path.element);
    }
    if (path.player) {
      path.player.destroy();
      const idx = State.players.indexOf(path.player);
      if (idx !== -1) State.players.splice(idx, 1);
    }
  });
  activePathPieces = [];
}

interface PathTileLayoutEntry {
  tile: PathTile;
  nodeA: MapEventNode;
  nodeB: MapEventNode;
  X_grid: number;
  Y_grid: number;
}

/**
 * Pure geometry/grouping pass shared by the sync and async grid-tile compilers below.
 * Builds a Group per positioned node, connects parent/child Groups with Lanes, synthesizes
 * junction + straight-lane PathTiles, and returns them already sorted in paint order.
 * Contains no image loading or DOM work, so both compileGridTilesSync (reads from the
 * pre-warmed pathImageCache) and compileGridTiles (awaits cold loads + render-cancellation)
 * can share it verbatim instead of maintaining two copies of this algorithm.
 */
function buildPathTileLayout(eventList: MapEventNode[]): PathTileLayoutEntry[] {
  interface Lane {
    from: Group;
    to: Group;
    direction: DirectionMask;
    tileArray: PathTile[];
    isLocked: boolean;
    isGrass: boolean;
    inDir: DirectionMask;
    outDir: DirectionMask;
  }

  interface Group {
    node: MapEventNode;
    col: number; // raw float grid col
    row: number; // raw float grid row
    lanesOut: Lane[];
    lanesIn: Lane[];
    key: string; // m_name
  }

  const groups: Group[] = [];

  // Helper to reverse directions for incoming edges
  function getOppositeDirection(dir: DirectionMask): DirectionMask {
    switch (dir) {
      case DirectionMask.UL:
        return DirectionMask.DR;
      case DirectionMask.DR:
        return DirectionMask.UL;
      case DirectionMask.UR:
        return DirectionMask.DL;
      case DirectionMask.DL:
        return DirectionMask.UR;
    }
    return DirectionMask.None;
  }

  // 1. Create a Group for every node with a valid position
  for (const node of eventList) {
    if (node.m_position) {
      const rawGrid = toGridCoords(node.m_position.x * 3, node.m_position.y * 3, false);
      groups.push({
        node,
        col: rawGrid.col,
        row: rawGrid.row,
        lanesOut: [],
        lanesIn: [],
        key: node.m_name!,
      });
    }
  }

  // 2. Build lanes (edges) between groups using raw directions and direct float interpolation
  for (const childGroup of groups) {
    const nodeA = childGroup.node;
    if (nodeA.m_parentEvent) {
      const parentName = nodeA.m_parentEvent;
      const parentGroup = groups.find(g => g.node.m_name === parentName);
      if (parentGroup) {
        const nodeB = parentGroup.node;
        const style = getSegmentTileStyle(nodeA, nodeB, eventList);

        const dir = getDirection(parentGroup.col, parentGroup.row, childGroup.col, childGroup.row);
        if (dir) {
          const tileArray: PathTile[] = [];

          let startCol = parentGroup.col;
          let startRow = parentGroup.row;

          if (State.data.snap) {
            startCol = Math.round(startCol);
            startRow = Math.round(startRow);
          }

          if (dir === DirectionMask.UL || dir === DirectionMask.DR) {
            const dCol = childGroup.col - startCol;
            const step = dCol > 0 ? 1.0 : -1.0;
            const absCol = Math.abs(dCol);

            for (let offset = 1.0; offset < absCol - 0.35; offset += 1.0) {
              const col = startCol + step * offset;
              tileArray.push({
                col,
                row: parentGroup.row,
                in: getOppositeDirection(dir),
                out: dir,
                isLocked: style.isLocked,
                isGrass: style.isGrass,
                filename: '',
              });
            }
          } else {
            const dRow = childGroup.row - startRow;
            const step = dRow > 0 ? 1.0 : -1.0;
            const absRow = Math.abs(dRow);

            for (let offset = 1.0; offset < absRow - 0.35; offset += 1.0) {
              const row = startRow + step * offset;
              tileArray.push({
                col: parentGroup.col,
                row,
                in: getOppositeDirection(dir),
                out: dir,
                isLocked: style.isLocked,
                isGrass: style.isGrass,
                filename: '',
              });
            }
          }

          const lane: Lane = {
            from: parentGroup,
            to: childGroup,
            direction: dir,
            tileArray,
            isLocked: style.isLocked,
            isGrass: style.isGrass,
            inDir: getOppositeDirection(dir),
            outDir: dir,
          };

          parentGroup.lanesOut.push(lane);
          childGroup.lanesIn.push(lane);
        }
      }
    }
  }

  // 3. Synthesize unique tile map from groups and lanes
  const finalTiles = new Map<string, { tile: PathTile; nodeA: MapEventNode; nodeB: MapEventNode }>();

  const TILE_INDEX_MAP: Record<number, string> = {
    2: 'empty_ur_dl.png',
    3: 'empty_ul_dr.png',
    4: 'empty_ul_ur_dr.png',
    5: 'empty_ul_ur_dl.png',
    6: 'empty_ur_dl_dr.png',
    7: 'empty_ul_dl_dr.png',
  };

  const TILE_LUT = [
    0, 2, 3, 4, 3, 6, 3, 4, 2, 2, 7, 5, 6, 6, 7, 5
  ];

  // Node Tiles
  for (const group of groups) {
    const incidentCount = group.lanesIn.length + group.lanesOut.length;
    if (incidentCount === 0) continue;

    let nodeCol = group.col;
    let nodeRow = group.row;

    if (group.lanesOut.length === 0 && group.lanesIn.length === 1) {
      const inLane = group.lanesIn[0];
      if (inLane.tileArray.length > 0) {
        const lastTile = inLane.tileArray[inLane.tileArray.length - 1];
        const step = inLane.direction === DirectionMask.DL || inLane.direction === DirectionMask.DR ? 1.0 : -1.0;

        if (inLane.direction === DirectionMask.UL || inLane.direction === DirectionMask.DR) {
          nodeCol = lastTile.col + step;
          nodeRow = lastTile.row;
        } else {
          nodeRow = lastTile.row + step;
          nodeCol = lastTile.col;
        }
      }
    }

    const incidentLanes: Lane[] = [];
    let mask = DirectionMask.None;

    for (const lane of group.lanesOut) {
      incidentLanes.push(lane);
      mask |= lane.outDir;
    }
    for (const lane of group.lanesIn) {
      incidentLanes.push(lane);
      mask |= lane.inDir;
    }

    let isLocked = true;
    for (const lane of incidentLanes) {
      if (!lane.isLocked) {
        isLocked = false;
        break;
      }
    }

    let isGrass = true;
    if (!isLocked) {
      let hasPaved = false;
      for (const lane of incidentLanes) {
        if (!lane.isLocked && !lane.isGrass) {
          hasPaved = true;
          break;
        }
      }
      isGrass = !hasPaved;
    } else {
      isGrass = false;
    }

    let filename = '';
    if (isLocked) {
      filename = 'locked.png';
    } else if (isGrass) {
      const isLight = (Math.round(Math.abs(nodeCol)) % 2) === (Math.round(Math.abs(nodeRow)) % 2);
      filename = isLight ? 'grass_light.png' : 'grass_dark.png';
    } else {
      const index = TILE_LUT[mask];
      filename = TILE_INDEX_MAP[index] || '';
    }

    const finalNodeCol = State.data.snap ? Math.round(nodeCol) : nodeCol;
    const finalNodeRow = State.data.snap ? Math.round(nodeRow) : nodeRow;

    const tile: PathTile = {
      col: finalNodeCol,
      row: finalNodeRow,
      in: group.lanesIn.length > 0 ? group.lanesIn[0].inDir : undefined,
      out: group.lanesOut.length > 0 ? group.lanesOut[0].outDir : undefined,
      isLocked,
      isGrass,
      filename,
    };

    let bestLane = incidentLanes[0];
    for (const lane of incidentLanes) {
      const paved = !lane.isLocked && !lane.isGrass;
      const grass = !lane.isLocked && lane.isGrass;

      const bestPaved = bestLane && !bestLane.isLocked && !bestLane.isGrass;
      const bestGrass = bestLane && !bestLane.isLocked && bestLane.isGrass;

      if (paved && !bestPaved) {
        bestLane = lane;
      } else if (grass && !bestPaved && !bestGrass) {
        bestLane = lane;
      }
    }

    finalTiles.set(group.key, {
      tile,
      nodeA: bestLane ? bestLane.to.node : group.node,
      nodeB: bestLane ? bestLane.from.node : group.node,
    });
  }

  // Lane Tiles
  let laneTileCounter = 0;
  for (const group of groups) {
    for (const lane of group.lanesOut) {
      for (const t of lane.tileArray) {
        let filename = '';
        if (t.isLocked) {
          filename = 'locked.png';
        } else if (t.isGrass) {
          const isLight = (Math.round(Math.abs(t.col)) % 2) === (Math.round(Math.abs(t.row)) % 2);
          filename = isLight ? 'grass_light.png' : 'grass_dark.png';
        } else {
          if (lane.direction === DirectionMask.UL || lane.direction === DirectionMask.DR) {
            filename = 'empty_ul_dr.png';
          } else {
            filename = 'empty_ur_dl.png';
          }
        }

        const tile: PathTile = {
          col: t.col,
          row: t.row,
          isLocked: t.isLocked,
          isGrass: t.isGrass,
          filename,
        };

        const uniqueLaneTileKey = `lane_tile_${laneTileCounter++}`;
        finalTiles.set(uniqueLaneTileKey, {
          tile,
          nodeA: lane.to.node,
          nodeB: lane.from.node,
        });
      }
    }
  }

  // Map tiles + sort into paint order
  const mappedTiles: PathTileLayoutEntry[] = Array.from(finalTiles.values()).map(({ tile, nodeA, nodeB }) => {
    const col = tile.col;
    const row = tile.row;

    const X_grid = 77.74 * col - 62.35 * row;
    const Y_grid = 32.90 * col + 37.10 * row;

    return { tile, nodeA, nodeB, X_grid, Y_grid };
  });

  mappedTiles.sort((a, b) => {
    if (Math.abs(a.Y_grid - b.Y_grid) > 0.0001) {
      return a.Y_grid - b.Y_grid;
    }
    return a.X_grid - b.X_grid;
  });

  return mappedTiles;
}

export function compileGridTilesSync(
    eventList: MapEventNode[],
    worldName: string,
    resolution: number
): PathPieceInfo[] {
  const mappedTiles = buildPathTileLayout(eventList);

  const results: PathPieceInfo[] = [];
  for (const t of mappedTiles) {
    const file = findPathTextureFile(worldName, t.tile.filename);
    if (!file) continue;

    const img = pathImageCache.get(file.name);
    if (!img) continue;

    const w = img.width;
    const h = img.height;

    const actual_X = t.X_grid * (resolution / 1800);
    const actual_Y = t.Y_grid * (resolution / 1800);

    const el = document.createElement('div');
    el.className = 'map-path-piece'; // NO map-piece class here, so NO hitbox!

    let m = Matrix.identity;
    m = Matrix.multiply(m, Matrix.translate(actual_X, actual_Y));
    m = Matrix.multiply(m, Matrix.translate(-w / 2, -h / 2));

    const transformStr = `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;

    el.style.cssText = `
      left:0px;
      top:0px;
      width:${w}px;
      height:${h}px;
      background-image:url(${getObjectUrlCached(file)});
      transform:${transformStr};
      pointer-events: none;
    `;

    results.push({
      fromNode: t.nodeB,
      toNode: t.nodeA,
      element: el,
    });
  }

  return results;
}

export function findPathTextureFile(worldName: string, filename: string): File | null {
  const resolution = State.data.textureResolution;
  const path = State.data.isChinaVersion
      ? `images/${resolution}/${worldName}/worldmap/path_${worldName}/${filename}`
      : `images/${resolution}/${worldName === 'egypt' || worldName === 'tutorial' ? 'initial' : 'full'}/worldmap/path_${worldName}/${filename}`;
  return findFileInGlobal(path);
}

export function loadSingleImage(file: File): Promise<HTMLImageElement | null> {
  const cacheKey = file.name;
  if (pathImageCache.has(cacheKey)) {
    return Promise.resolve(pathImageCache.get(cacheKey)!);
  }
  return new Promise((resolve) => {
    const url = getObjectUrlCached(file);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      pathImageCache.set(cacheKey, img);
      resolve(img);
    };
    img.onerror = () => {
      resolve(null);
    };
  });
}

function getDirection(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number
): DirectionMask {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;

  if (Math.abs(dc) > Math.abs(dr))
    return dc > 0
        ? DirectionMask.DR
        : DirectionMask.UL;

  if (Math.abs(dr) > Math.abs(dc))
    return dr > 0
        ? DirectionMask.DL
        : DirectionMask.UR;

  return DirectionMask.None;
}

function getSegmentTileStyle(
    nodeA: MapEventNode,
    nodeB: MapEventNode,
    eventList: MapEventNode[]
): { isLocked: boolean; isGrass: boolean } {
  const nodeA_status = eventNodeRuntimeMap.get(nodeA)?.wmed?.S ?? WorldMapEventStatus.locked;

  // (1) key_gate的S==locked时，该key_gate的父节点到该结点之间的路径用empty而不是locked
  if (nodeA.m_eventType === 'key_gate' && nodeA_status === WorldMapEventStatus.locked) {
    return { isLocked: false, isGrass: false };
  }

  // (2) key_gate的S==cleared时，该key_gate之下的子路径只看相邻父子结点的起点/父节点是否cleared来选择grass_xxx or emptyXXX
  // 没有追溯到key_gate的路径则只看相邻父子结点的起点/父节点是否cleared来选择grass_xxx or emptyXXX
  let current: MapEventNode | undefined = nodeB;
  let hasLockedKeyGateAncestor = false;
  const visited = new Set<string>();
  while (current) {
    if (current.m_eventType === 'key_gate') {
      const runtime = eventNodeRuntimeMap.get(current);
      const s = runtime?.wmed?.S ?? WorldMapEventStatus.locked;
      if (s !== WorldMapEventStatus.cleared) {
        hasLockedKeyGateAncestor = true;
        break;
      }
    }
    if (!current.m_parentEvent) break;
    const pName: string = current.m_parentEvent;
    if (visited.has(pName)) break;
    visited.add(pName);
    current = eventList.find(n => n.m_name === pName);
  }

  if (hasLockedKeyGateAncestor) {
    return { isLocked: true, isGrass: false };
  }

  const parentStatus = eventNodeRuntimeMap.get(nodeB)?.wmed?.S ?? WorldMapEventStatus.locked;
  const isGrass = parentStatus === WorldMapEventStatus.cleared;
  return { isLocked: false, isGrass };
}

/**
 * Async grid-tile compile used for the initial/full render (cold-loads whatever texture files
 * aren't cached yet). `isInterrupted` lets the caller (MapRenderer) cancel stale work the same
 * way it already does everywhere else in the render pipeline, without PathRenderer needing to
 * know about MapRenderer's render-task-id bookkeeping.
 */
export async function compileGridTiles(
    eventList: MapEventNode[],
    worldName: string,
    resolution: number,
    isInterrupted: () => boolean
): Promise<PathPieceInfo[]> {
  const mappedTiles = buildPathTileLayout(eventList);

  const tileLoadPromises = mappedTiles.map((t) => {
    const file = findPathTextureFile(worldName, t.tile.filename);
    if (!file) return Promise.resolve(null);

    return (async () => {
      const img = await loadSingleImage(file);
      if (!img) return null;

      if (isInterrupted()) return null;

      const w = img.width;
      const h = img.height;

      const actual_X = t.X_grid * (resolution / 1800);
      const actual_Y = t.Y_grid * (resolution / 1800);

      const el = document.createElement('div');
      el.className = 'map-path-piece';

      let m = Matrix.identity;
      m = Matrix.multiply(m, Matrix.translate(actual_X, actual_Y));
      m = Matrix.multiply(m, Matrix.translate(-w / 2, -h / 2));

      const transformStr = `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;

      el.style.cssText = `
        left:0px;
        top:0px;
        width:${w}px;
        height:${h}px;
        background-image:url(${getObjectUrlCached(file)});
        transform:${transformStr};
        pointer-events: none;
      `;

      return {
        fromNode: t.nodeB,
        toNode: t.nodeA,
        element: el,
      } as PathPieceInfo;
    })();
  });

  const tileResults = await Promise.all(tileLoadPromises);
  if (isInterrupted()) {
    return [];
  }
  return tileResults.filter((p): p is PathPieceInfo => p !== null);
}

export async function preLoadPathPiece(
    fromNode: MapEventNode,
    toNode: MapEventNode,
    animData: any,
    startFrameOffset: number
): Promise<PathPieceInfo | null> {
  try {
    const assets = await compileAnimAssets(animData);
    if (!assets) return null;

    const { animation, textureMap } = assets;
    const sizeW = animation.size[0] || 390;
    const sizeH = animation.size[1] || 390;

    const resolution = State.data.textureResolution;
    const trans = computePathTransform(
        fromNode.m_position?.x || 0,
        fromNode.m_position?.y || 0,
        toNode.m_position?.x || 0,
        toNode.m_position?.y || 0,
        resolution
    );

    const el = document.createElement('div');
    el.className = 'map-path-piece';

    el.style.cssText = `
      left:0px;
      top:0px;
      width:${sizeW}px;
      height:${sizeH}px;
      transform:${trans.transformStr};
      pointer-events: none;
    `;

    const canvas = document.createElement('canvas');
    canvas.width = sizeW;
    canvas.height = sizeH;
    el.appendChild(canvas);

    const player = new PamCanvasPlayer(canvas, animation, textureMap, animData?.path);
    const startNodeRuntime = eventNodeRuntimeMap.get(toNode);
    const startNodeStatus = startNodeRuntime?.wmed?.S;
    const pathLabel = startNodeStatus === WorldMapEventStatus.cleared ? 'beam_path_open' : 'beam_path_on';

    player.playLabel(pathLabel, true, startFrameOffset);

    return {
      fromNode,
      toNode,
      element: el,
      player,
      randomOffset: startFrameOffset,
    };
  } catch (e) {
    console.error('[Path Animation Load Error]', e);
    return null;
  }
}