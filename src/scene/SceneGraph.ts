/**
 * SceneGraph — top-level owner of the live map scene.
 *
 * Responsibilities:
 *   - bind LayerStack to #map-container
 *   - full / event-only clear
 *   - parallax + map-only visibility
 *   - registry of mounted entity handles (island / event / path)
 *
 * Rendering of individual nodes is delegated to factories + existing loaders;
 * this module only owns structure and lifecycle bookkeeping.
 */

import { State } from '../core/state';
import { LayerStack, bindLayerStack, getLayerStack, tryGetLayerStack } from './LayerStack';
import type { PieceInfo, EventPieceInfo } from '../domain/types';

export type PathHandle = {
  element: HTMLDivElement;
  player?: { destroy(): void };
  fromNode?: unknown;
  toNode?: unknown;
};

class SceneGraphImpl {
  private stack: LayerStack | null = null;
  private pathHandles: PathHandle[] = [];

  init(mapContainer: HTMLDivElement): void {
    this.dispose();
    this.stack = new LayerStack(mapContainer);
    bindLayerStack(this.stack);
  }

  get layers(): LayerStack {
    return getLayerStack();
  }

  /** Full teardown before a full re-render. */
  beginFullRender(mapContainer: HTMLDivElement): LayerStack {
    this.disposeEntitiesOnly();
    if (this.stack) {
      this.stack.clear();
    } else {
      this.stack = new LayerStack(mapContainer);
      bindLayerStack(this.stack);
    }
    // Full render historically builds into a detached fragment then swaps —
    // callers may still do that; LayerStack.parent is mapContainer for live
    // mounts and for incremental work after the swap.
    return this.stack;
  }

  /** After full render built into a detached target, re-point LayerStack at the live root. */
  attachBuiltRoots(mapContainer: HTMLDivElement): void {
    if (this.stack) {
      this.stack.reparent(mapContainer);
      return;
    }
    const bound = tryGetLayerStack();
    if (bound) {
      bound.reparent(mapContainer);
      this.stack = bound;
      return;
    }
    this.stack = new LayerStack(mapContainer);
    bindLayerStack(this.stack);
  }

  applyParallax(cameraX: number): void {
    this.stack?.applyParallax(cameraX);
  }

  setMapOnly(on: boolean): void {
    this.stack?.setMapOnly(on);
  }

  registerPath(handles: PathHandle[]): void {
    this.pathHandles = handles;
  }

  getPaths(): readonly PathHandle[] {
    return this.pathHandles;
  }

  clearPaths(): void {
    for (const p of this.pathHandles) {
      p.player?.destroy();
      p.element.parentNode?.removeChild(p.element);
    }
    this.pathHandles = [];
  }

  /** Destroy all players + DOM for pieces/events/paths; clear layer hosts. */
  dispose(): void {
    this.disposeEntitiesOnly();
    this.stack?.clear();
    this.stack = null;
    bindLayerStack(null);
  }

  private disposeEntitiesOnly(): void {
    for (const p of State.data.pieces) {
      p.player?.destroy();
      p.element.parentNode?.removeChild(p.element);
    }
    State.data.pieces = [];

    for (const ep of State.data.eventPieces) {
      ep.players?.forEach((pl) => pl.destroy());
      ep.element.parentNode?.removeChild(ep.element);
    }
    State.data.eventPieces = [];

    this.clearPaths();
    State.players = [];
  }

  /** Mount helpers used by ObjectMount / factories. */
  mountIsland(info: PieceInfo, parallax: number, draw: number): void {
    const container = this.layers.getMapDrawContainer(parallax, draw);
    info.element.style.zIndex = String(this.layers.nextZ(container));
    container.appendChild(info.element);
    State.data.pieces.push(info);
    if (info.player) State.players.push(info.player);
  }

  mountEvent(info: EventPieceInfo, opts: { zombossStage?: boolean; parallax?: number; draw?: number }): void {
    let container: HTMLElement;
    if (opts.zombossStage) {
      this.layers.ensureHost(0);
      container = this.layers.zomboss!;
    } else {
      container = this.layers.getEventDrawContainer(opts.parallax ?? 0, opts.draw ?? 0);
    }
    info.element.style.zIndex = String(this.layers.nextZ(container));
    container.appendChild(info.element);
    State.data.eventPieces.push(info);
    info.players?.forEach((pl) => State.players.push(pl));
  }

  mountPath(handle: PathHandle): void {
    this.layers.ensureHost(0);
    const container = this.layers.path!;
    handle.element.style.zIndex = String(this.layers.nextZ(container));
    container.appendChild(handle.element);
    if (handle.player) State.players.push(handle.player as any);
    this.pathHandles.push(handle);
  }
}

export const SceneGraph = new SceneGraphImpl();

export function isSceneReady(): boolean {
  return tryGetLayerStack() !== null;
}
