export type Transform =
  | { type: 'translate'; x: number; y: number }
  | { type: 'rotate_translate'; angle: number; x: number; y: number }
  | { type: 'matrix_translate'; a: number; b: number; c: number; d: number; x: number; y: number };

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ImageDef {
  name: string;
  size: { width: number; height: number } | null;
  transform: Transform;
  _cachedMatrix?: Matrix6;
}

export interface Command {
  command: string;
  argument: string;
}

export interface Remove {
  index: number;
}

export interface Append {
  index: number;
  name: string | null;
  resource: number;
  sprite: boolean;
  additive: boolean;
  preloadFrame: number;
  timeScale: number;
}

export interface Change {
  index: number;
  transform: Transform;
  color: Color | null;
  spriteFrameNumber: number | null;
  sourceRectangle: [number, number, number, number] | null;
}

export interface Frame {
  label: string | null;
  stop: boolean;
  command: Command[];
  remove: Remove[];
  append: Append[];
  change: Change[];
}

export interface Sprite {
  name: string | null;
  frameRate: number | null;
  workArea: { start: number; duration: number } | null;
  frame: Frame[];
}

export interface Animation {
  version: number;
  frameRate: number;
  position: [number, number];
  size: [number, number];
  image: ImageDef[];
  sprite: Sprite[];
  mainSprite: Sprite | null;
}

export type Matrix6 = [number, number, number, number, number, number];

export interface FrameLabel {
  name: string;
  begin: number;
  end: number;
}

export interface LayerSnapshot {
  index: number;
  resource: number;
  isSprite: boolean;
  additive: boolean;
  firstFrame: number;
  timeScale: number;
  preloadFrame: number;
  transform: Matrix6;
  color: Color;
  spriteFrameNumber: number | null;
  sourceRect: [number, number, number, number] | null;
}

export type SpriteTimeline = LayerSnapshot[][];

export type TimelinesMap = Record<string | number, SpriteTimeline>;
