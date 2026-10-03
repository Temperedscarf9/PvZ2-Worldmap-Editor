/**
 * LayerStack — factory for the map's covering-layer DOM tree.
 *
 * Owns every parallax root and draw-layer container. MapRenderer / ObjectMount
 * must go through this instead of hand-building containers or reading raw Maps
 * on State.data. The sparse strategy (only build layers that have content)
 * is preserved; z-index is a pure function of layer indices so lazy creation
 * matches an eager full-grid layout.
 */

import { State } from '../core/state';
import {
  LAYER_Z,
  clampDrawLayer,
  clampParallax,
  drawLayerZIndex,
  groupKey,
  parallaxZIndex,
  sortedParallaxUsed,
} from './layers';
import { parallaxOffsetX } from './coords';

export type LayerHost = {
  root: HTMLDivElement;
  mapPieces: HTMLDivElement;
  mapParallax: HTMLDivElement;
  eventCovering: HTMLDivElement;
  eventParallax: HTMLDivElement;
};

function makeAbsFull(className: string, zIndex?: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.style.position = 'absolute';
  el.style.top = '0';
  el.style.left = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.pointerEvents = 'none';
  if (zIndex !== undefined) el.style.zIndex = String(zIndex);
  return el;
}

function makeDrawContainer(dLayer: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'draw-layer-container';
  el.style.zIndex = String(drawLayerZIndex(dLayer));
  return el;
}

export class LayerStack {
  private parent: HTMLElement;
  private readonly hosts = new Map<number, LayerHost>();
  private readonly mapDraw = new Map<string, HTMLDivElement>();
  private readonly eventDraw = new Map<string, HTMLDivElement>();

  zomboss: HTMLDivElement | null = null;
  path: HTMLDivElement | null = null;
  /** Convenience alias: event covering root at parallax 0. */
  eventRoot: HTMLDivElement | null = null;

  constructor(parent: HTMLElement) {
    this.parent = parent;
  }

  /** After a fragment→live swap, point subsequent ensureHost appends at the live root. */
  reparent(parent: HTMLElement): void {
    this.parent = parent;
  }

  /** Ensure parallax root L exists (with mapPieces + events covering shells). */
  ensureHost(rawLayer: number): LayerHost {
    const pLayer = clampParallax(rawLayer);
    const existing = this.hosts.get(pLayer);
    if (existing) return existing;

    const root = makeAbsFull('parallax-root-container', parallaxZIndex(pLayer));

    const mapPieces = document.createElement('div');
    mapPieces.className = 'covering-layer-root map-pieces-layer';
    mapPieces.style.zIndex = String(LAYER_Z.mapPieces);
    root.appendChild(mapPieces);

    const mapParallax = document.createElement('div');
    mapParallax.className = 'parallax-layer-container';
    mapParallax.style.zIndex = '1';
    mapPieces.appendChild(mapParallax);

    if (pLayer === 0) {
      if (!this.zomboss) {
        this.zomboss = document.createElement('div');
        this.zomboss.className = 'covering-layer-root zomboss-layer';
        this.zomboss.style.zIndex = String(LAYER_Z.zomboss);
      }
      root.appendChild(this.zomboss);

      if (!this.path) {
        this.path = document.createElement('div');
        this.path.className = 'covering-layer-root path-layer';
        this.path.style.zIndex = String(LAYER_Z.path);
      }
      root.appendChild(this.path);
    }

    const eventCovering = document.createElement('div');
    eventCovering.className = 'covering-layer-root events-layer';
    eventCovering.style.zIndex = String(LAYER_Z.event);
    root.appendChild(eventCovering);
    if (pLayer === 0) this.eventRoot = eventCovering;

    const eventParallax = document.createElement('div');
    eventParallax.className = 'parallax-layer-container';
    eventParallax.style.zIndex = '1';
    eventCovering.appendChild(eventParallax);

    this.parent.appendChild(root);

    const host: LayerHost = { root, mapPieces, mapParallax, eventCovering, eventParallax };
    this.hosts.set(pLayer, host);
    this.syncStateMaps();
    return host;
  }

  getMapDrawContainer(parallaxLayer: number, drawLayer: number): HTMLDivElement {
    const pl = clampParallax(parallaxLayer);
    const dl = clampDrawLayer(drawLayer);
    const key = groupKey(pl, dl);
    const hit = this.mapDraw.get(key);
    if (hit) return hit;

    const host = this.ensureHost(pl);
    const container = makeDrawContainer(dl);
    host.mapParallax.appendChild(container);
    this.mapDraw.set(key, container);
    this.syncStateMaps();
    return container;
  }

  getEventDrawContainer(parallaxLayer: number, drawLayer: number): HTMLDivElement {
    const pl = clampParallax(parallaxLayer);
    const dl = clampDrawLayer(drawLayer);
    const key = groupKey(pl, dl);
    const hit = this.eventDraw.get(key);
    if (hit) return hit;

    const host = this.ensureHost(pl);
    const container = makeDrawContainer(dl);
    host.eventParallax.appendChild(container);
    this.eventDraw.set(key, container);
    this.syncStateMaps();
    return container;
  }

  /**
   * Pre-build hosts for a known set of parallax layers (full render path).
   * Draw-layer containers are still created lazily on first mount.
   */
  prepareParallax(used: Iterable<number>): void {
    for (const pl of sortedParallaxUsed(new Set([...used, 0]))) {
      this.ensureHost(pl);
    }
  }

  /** Apply scroll-linked parallax drift to every root (same formula as EditorApp tick). */
  applyParallax(scrollDx?: number): void {
    for (const [layer, host] of this.hosts) {
      host.root.style.transform = `translateX(${parallaxOffsetX(layer, scrollDx)}px)`;
    }
  }

  setMapOnly(on: boolean): void {
    const display = on ? 'none' : '';
    if (this.zomboss) this.zomboss.style.display = display;
    if (this.path) this.path.style.display = display;
    for (const host of this.hosts.values()) {
      host.eventCovering.style.display = display;
    }
  }

  /** Next sequential z-index inside a container (append order). */
  nextZ(container: HTMLElement): number {
    let max = 0;
    for (let i = 0; i < container.children.length; i++) {
      const z = parseInt((container.children[i] as HTMLElement).style.zIndex || '0', 10);
      if (!Number.isNaN(z) && z > max) max = z;
    }
    return max + 1;
  }

  /**
   * Tear down every root. Does not destroy entity players — caller must
   * dispose entities first. Leaves parent element intact.
   */
  clear(): void {
    for (const host of this.hosts.values()) {
      host.root.remove();
    }
    this.hosts.clear();
    this.mapDraw.clear();
    this.eventDraw.clear();
    this.zomboss = null;
    this.path = null;
    this.eventRoot = null;
    this.syncStateMaps();
  }

  /**
   * Bridge: keep State.data.* Maps in sync so legacy call sites that still
   * read them continue to work during the migration.
   */
  private syncStateMaps(): void {
    State.data.parallaxRoots.clear();
    State.data.parallaxContainers.clear();
    State.data.eventParallaxContainers.clear();
    State.data.drawLayerContainers.clear();
    State.data.eventDrawLayerContainers.clear();

    for (const [pl, host] of this.hosts) {
      State.data.parallaxRoots.set(pl, host.root);
      State.data.parallaxContainers.set(pl, host.mapParallax);
      State.data.eventParallaxContainers.set(pl, host.eventParallax);
    }
    for (const [key, el] of this.mapDraw) {
      State.data.drawLayerContainers.set(key, el);
    }
    for (const [key, el] of this.eventDraw) {
      State.data.eventDrawLayerContainers.set(key, el);
    }
    State.data.zombossContainer = this.zomboss;
    State.data.pathContainer = this.path;
    State.data.eventContainer = this.eventRoot;
  }
}

/** Process-wide stack bound to #map-container after SceneGraph.init. */
let activeStack: LayerStack | null = null;

export function getLayerStack(): LayerStack {
  if (!activeStack) {
    throw new Error('[LayerStack] not initialized — call SceneGraph.init first');
  }
  return activeStack;
}

export function bindLayerStack(stack: LayerStack | null): void {
  activeStack = stack;
}

export function tryGetLayerStack(): LayerStack | null {
  return activeStack;
}
