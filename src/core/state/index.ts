import { StateType, MapEventNode, WorldMapEventStatus } from '../../domain/types';

export const State: StateType = {
  data: {
    mapConfig: null,
    worlds: {},
    globalFiles: {},
    indexedFiles: new Map<string, File>(),
    filesByDir: new Map<string, File[]>(),
    resourceManifestFile: null,
    worldMapFiles: new Map<string, File>(),
    availableWorlds: [],
    selectedWorld: null,
    pieces: [],
    eventPieces: [],
    plantPacketMeta: new Map<string, { x: number; y: number }>(),
    unlockAll: false,
    boxLeft: 0,
    parallaxRoots: new Map<number, HTMLDivElement>(),
    parallaxContainers: new Map<number, HTMLDivElement>(),
    drawLayerContainers: new Map<string, HTMLDivElement>(),
    eventParallaxContainers: new Map(),
    eventDrawLayerContainers: new Map(),
    zombossContainer: null,
    pathContainer: null,
    isLinear: false,
    isChinaVersion: false,
    isMapOnly: false,
    textureResolution: 1536,
    eventContainer: null,
    snap: false,
    moveSnapEnabled: false,
  },
  camera: { x: 0, y: 0, scale: 1 },
  interaction: {
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    velocityX: 0,
    velocityY: 0,
    lastFrameTime: 0,
  },
  players: [],
};

export interface EventNodeRuntime {
  wmed: { W: number; E: number; S: WorldMapEventStatus; C?: number };
  /** Scheme 2: when multiple `boss` nodes exist, intermediate ones suppress stage via child/grandchild check. */
  renderZombossNode?: boolean;
  /**
   * Hologram only when unlocked|cleared AND lowest boss|nonfinalboss on the full
   * unlocked/cleared inheritance chain (no unlocked|cleared boss-type descendant). locked never.
   */
  renderHologramNode?: boolean;
}

export interface PieceRuntime {
  worldX: number;
  worldY: number;
  flipScale: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  angle: number;
  animId?: number;
}

class ClearableWeakMap<K extends object, V> {
  private map = new WeakMap<K, V>();
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V): this { this.map.set(key, value); return this; }
  has(key: K): boolean { return this.map.has(key); }
  delete(key: K): boolean { return this.map.delete(key); }
  clear(): void { this.map = new WeakMap<K, V>(); }
}

export const eventNodeRuntimeMap = new WeakMap<MapEventNode, EventNodeRuntime>();
export const pieceRuntimeMap = new ClearableWeakMap<MapEventNode, PieceRuntime>();
export const imageDimensionsCache = new WeakMap<File, { width: number; height: number }>();

if (typeof window !== 'undefined') {
  (window as any).State = State;
}
