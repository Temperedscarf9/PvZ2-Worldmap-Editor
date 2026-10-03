/**
 * PathFactory — lifecycle for path tiles (non-linear grid) and linear beam segments.
 *
 * PathRenderer remains responsible for geometry + asset compile; this factory owns:
 *   - which pieces are live (activePathPieces)
 *   - DOM mount into LayerStack.path
 *   - State.players registration for beam players
 *   - dispose / rebuild
 */

import type { MapEventNode } from '../../domain/types';
import { State } from '../../core/state';
import {
  PathPieceInfo,
  activePathPieces,
  setActivePathPieces,
  detachActivePathPieces,
  compileGridTiles,
  compileGridTilesSync,
  preLoadPathPiece,
  updatePathElements as pathRendererUpdateTransforms,
} from '../../render/PathRenderer';
import { findAnimInGlobal } from '../../core/resources';
import { tryGetLayerStack, bindLayerStack, LayerStack } from '../LayerStack';

function stack(): LayerStack {
  const existing = tryGetLayerStack();
  if (existing) return existing;
  const root = document.getElementById('map-container');
  if (!root) throw new Error('[PathFactory] #map-container missing');
  const s = new LayerStack(root);
  bindLayerStack(s);
  return s;
}

function unregisterPlayer(player: { destroy(): void } | undefined): void {
  if (!player) return;
  player.destroy();
  const i = State.players.indexOf(player as any);
  if (i !== -1) State.players.splice(i, 1);
}

function mountList(paths: PathPieceInfo[]): void {
  const layers = stack();
  layers.ensureHost(0);
  const container = layers.path;
  if (!container) return;

  let z = 1;
  for (const path of paths) {
    path.element.style.zIndex = String(z++);
    container.appendChild(path.element);
    if (path.player) State.players.push(path.player);
  }
  setActivePathPieces(paths);
}

/** Linear-mode: parent→child depth used for beam start-frame offset cycle. */
function nodeDepth(node: MapEventNode, eventList: MapEventNode[]): number {
  let depth = 0;
  let current: MapEventNode | undefined = node;
  const visited = new Set<string>();
  while (current?.m_parentEvent) {
    if (visited.has(current.m_name!)) break;
    visited.add(current.m_name!);
    const parent = eventList.find((n) => n.m_name === current!.m_parentEvent);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

export const PathFactory = {
  /** Tear down every live path piece (DOM + players). */
  clear(): void {
    detachActivePathPieces();
  },

  /**
   * Compile path pieces without mounting (for full render: build assets first,
   * then mount after LayerStack exists on the render target).
   */
  async compile(
    eventList: MapEventNode[],
    worldName: string,
    isInterrupted: () => boolean = () => false
  ): Promise<PathPieceInfo[]> {
    const resolution = State.data.textureResolution;
    const isLinear = State.data.isLinear;
    let paths: PathPieceInfo[] = [];

    if (!isLinear) {
      paths = await compileGridTiles(eventList, worldName, resolution, isInterrupted);
      if (isInterrupted()) return [];
    } else {
      const pathAnimDir = `images/${resolution}/${State.data.isChinaVersion ? 'UICommon' : 'initial'}/worldmap/map_path/`;
      const pathAnimData = findAnimInGlobal(pathAnimDir);
      if (pathAnimData) {
        const offsets = [66, 33, 0];
        const promises: Promise<PathPieceInfo | null>[] = [];
        for (const nodeA of eventList) {
          if (!nodeA.m_parentEvent || !nodeA.m_position) continue;
          const nodeB = eventList.find((n) => n.m_name === nodeA.m_parentEvent);
          if (!nodeB?.m_position) continue;
          const parentDepth = nodeDepth(nodeB, eventList);
          promises.push(preLoadPathPiece(nodeA, nodeB, pathAnimData, offsets[parentDepth % offsets.length]));
        }
        const results = await Promise.all(promises);
        if (isInterrupted()) {
          results.forEach((p) => p?.player?.destroy());
          return [];
        }
        paths = results.filter((p): p is PathPieceInfo => p !== null);
        paths.sort((a, b) => {
          const ay = ((a.fromNode?.m_position?.y ?? 0) + (a.toNode?.m_position?.y ?? 0)) / 2;
          const by = ((b.fromNode?.m_position?.y ?? 0) + (b.toNode?.m_position?.y ?? 0)) / 2;
          if (ay !== by) return ay - by;
          const ax = ((a.fromNode?.m_position?.x ?? 0) + (a.toNode?.m_position?.x ?? 0)) / 2;
          const bx = ((b.fromNode?.m_position?.x ?? 0) + (b.toNode?.m_position?.x ?? 0)) / 2;
          return ax - bx;
        });
      }
    }
    return paths;
  },

  /** Mount a pre-compiled list into LayerStack.path and register as active. */
  mountAll(paths: PathPieceInfo[]): void {
    mountList(paths);
  },

  /** Compile + mount (incremental / eventOnly). */
  async buildFull(
    eventList: MapEventNode[],
    worldName: string,
    isInterrupted: () => boolean = () => false
  ): Promise<PathPieceInfo[]> {
    this.clear();
    const paths = await this.compile(eventList, worldName, isInterrupted);
    if (isInterrupted() || !paths.length) {
      paths.forEach((p) => unregisterPlayer(p.player));
      return [];
    }
    this.mountAll(paths);
    return paths;
  },

  /**
   * Non-linear eventOnly: rebuild grid tiles in place.
   * Linear: skip — beam labels updated separately by MapRenderer.
   */
  async rebuildGridForEventOnly(
    eventList: MapEventNode[],
    worldName: string,
    isInterrupted: () => boolean
  ): Promise<void> {
    if (State.data.isLinear) return;
    this.clear();
    const resolution = State.data.textureResolution;
    const newTiles = await compileGridTiles(eventList, worldName, resolution, isInterrupted);
    if (isInterrupted()) return;
    mountList(newTiles);
  },

  /**
   * Sync rebuild after a single node move (non-linear).
   * Uses pre-warmed image cache — no async loads.
   */
  rebuildGridSync(): void {
    if (State.data.isLinear) {
      pathRendererUpdateTransforms();
      return;
    }
    const worldName = State.data.selectedWorld;
    if (!worldName || !State.data.mapConfig) return;
    const eventList = State.data.mapConfig.objdata.m_eventList || [];
    const resolution = State.data.textureResolution;

    // Detach without destroying players (grid tiles have none)
    activePathPieces.forEach((path) => {
      path.element.parentNode?.removeChild(path.element);
    });
    setActivePathPieces([]);

    const newPaths = compileGridTilesSync(eventList, worldName, resolution);
    mountList(newPaths);
  },

  /** Update linear beam transforms after a node drag; or rebuild grid if non-linear. */
  refreshAfterMove(): void {
    if (State.data.isLinear) {
      pathRendererUpdateTransforms();
    } else {
      this.rebuildGridSync();
    }
  },

  get active(): readonly PathPieceInfo[] {
    return activePathPieces;
  },
};
