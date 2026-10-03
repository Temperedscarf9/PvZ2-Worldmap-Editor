import type { PamCanvasPlayer } from '../pam/canvas-player';

export enum MapEventType {
  none = 0,
  level = 1,
  plantbox = 2,
  plant = 3,
  upgrade = 4,
  powerup = 5,
  star_gate = 6,
  key_gate = 7,
  path_node = 8,
  island = 9,
  doodad = 10,
  giftbox = 11,
  pinata = 12,
}

export enum WorldMapEventStatus {
  undiscovered = 0,
  locked = 1,
  unlocked = 2,
  cleared = 3,
}

export interface MapEventNode {
  m_position?: { x: number; y: number };
  m_imageID?: number;
  m_eventType: string;
  m_name?: string;
  m_toggleName?: string;
  m_dataString: string;
  m_unlockedFrom?: string;
  m_visibleFrom?: string;
  m_parentEvent?: string;
  m_displayText?: string;
  m_cost?: string;
  m_autoVisible?: boolean;
  m_completedNarrationID?: string;
  m_unlockedNarrationID?: string;
  m_worldMapTutorial?: string;
  m_worldMapTutorialVisibleWhen?: string;
  m_isTimedEvent?: boolean;
  m_isArtFlipped?: boolean;
  m_levelNodeType?: string;
  m_isChallengeType?: boolean;
  m_drawLayer?: number;
  m_rotationAngle?: number;
  m_rotationRate?: number;
  m_scaleX?: number;
  m_scaleY?: number;
  m_parallaxLayer?: number;
  m_eventId: number;
  m_inheritAssetFilter?: boolean;
}

export interface MapBoundingRect {
  mX: number;
  mY: number;
  mWidth: number;
  mHeight: number;
}

export interface MapConfigObjectData {
  m_mapPieces?: MapEventNode[];
  m_eventList?: MapEventNode[];
  m_worldName: string;
  m_creationTime: number;
  m_resGroupID: number;
  m_boundingRect?: MapBoundingRect;
  m_worldId: number;
  m_version: number;
}

export interface MapConfigObject {
  uid: string;
  objclass: string;
  objdata: MapConfigObjectData;
}

export interface WorldData {
  version: number;
  objects: MapConfigObject[];
}

export interface WorldAssets {
  images: Record<string, File>;
  anims: Record<string, any>;
}

export interface RawAnimFolderData {
  json: File;
  files: File[];
  path: string;
}

export interface PieceInfo {
  piece: MapEventNode;
  element: HTMLDivElement;
  player?: PamCanvasPlayer;
}

export interface EventPieceInfo {
  node: MapEventNode;
  element: HTMLDivElement;
  players?: PamCanvasPlayer[];
  resources?: EventResourceDef[];
  isZombossStage?: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface InteractionState {
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
  velocityX: number;
  velocityY: number;
  lastFrameTime: number;
}

export interface StateType {
  data: {
    mapConfig: MapConfigObject | null;
    worlds: Record<string, WorldAssets>;
    globalFiles: Record<string, File>;
    indexedFiles: Map<string, File>;
    filesByDir: Map<string, File[]>;
    resourceManifestFile: File | null;
    // Discovered worldmap.json files: worldName (folder under packages/worlds/) -> File
    worldMapFiles: Map<string, File>;
    availableWorlds: string[];
    selectedWorld: string | null;
    pieces: PieceInfo[];
    eventPieces: EventPieceInfo[];
    plantPacketMeta: Map<string, { x: number; y: number }>;
    unlockAll: boolean;
    boxLeft: number;
    /** Per-parallax-layer root under #map-container; receives the scroll-linked translateX. */
    parallaxRoots: Map<number, HTMLDivElement>;
    parallaxContainers: Map<number, HTMLDivElement>;
    drawLayerContainers: Map<string, HTMLDivElement>;
    eventParallaxContainers: Map<number, HTMLDivElement>;
    eventDrawLayerContainers: Map<string, HTMLDivElement>;
    // Flat (no parallax/drawLayer grid) containers for the other three covering layers.
    zombossContainer: HTMLDivElement | null;
    pathContainer: HTMLDivElement | null;
    isLinear: boolean;
    isChinaVersion: boolean;
    snap: boolean;
    // Editor-only toggle for the toolbar "Snap" button - distinct from `snap` above
    // (which is the grid-coordinate rounding flag used elsewhere, e.g. path tiles).
    moveSnapEnabled: boolean;
    isMapOnly: boolean;
    textureResolution: number;
    // The flat container for the Event Layer specifically (m_eventList minus doodad) - distinct
    // from zombossContainer/pathContainer/doodad*Containers above.
    eventContainer: HTMLDivElement | null;
  };
  camera: CameraState;
  interaction: InteractionState;
  players: PamCanvasPlayer[];
}

export interface LayerDef {
  file: File | null;
  offset?: { x: number; y: number };
}

export interface EventResourceDef {
  type: 'animation' | 'image' | 'composited-image';
  animData?: RawAnimFolderData;
  file?: File;
  url?: string;
  options?: {
    label: string;
    probabilityBucket?: Record<string, number>;
    probabilitySide?: string;
    delayMin?: number;
    delayMax?: number;
  };
  offset?: { x: number; y: number };
  scale?: number;
  flipX?: boolean;
  width?: number;
  height?: number;
}
export interface PathTile {
  col: number;
  row: number;

  in?: DirectionMask;
  out?: DirectionMask;

  isLocked: boolean;
  isGrass: boolean;

  filename: string;
}

export enum DirectionMask {
  None = 0,

  UR = 1 << 0, // 0001
  UL = 1 << 1, // 0010
  DR = 1 << 2, // 0100
  DL = 1 << 3, // 1000
}
