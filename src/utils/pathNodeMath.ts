import { Matrix, SimpleMatrix6 } from './mathTool';

export interface PathTransformResult {
  worldAX: number;
  worldAY: number;
  worldBX: number;
  worldBY: number;
  dx: number;
  dy: number;
  distance: number;
  midX: number;
  midY: number;
  angle: number;
  scaleX: number;
  matrix: SimpleMatrix6;
  transformStr: string;
}

export function computePathTransform(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  resolution: number
): PathTransformResult {
  const worldAX = fromX * (resolution / 600);
  const worldAY = fromY * (resolution / 600);
  const worldBX = toX * (resolution / 600);
  const worldBY = toY * (resolution / 600);

  const dx = worldAX - worldBX;
  const dy = worldAY - worldBY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const midX = (worldAX + worldBX) / 2;
  const midY = (worldAY + worldBY) / 2;

  const angle = Math.atan2(dy, dx);
  const scaleX = distance / (130 * (resolution / 1536));

  let m = Matrix.identity;
  m = Matrix.multiply(m, Matrix.translate(midX, midY));
  m = Matrix.multiply(m, Matrix.rotate(angle));
  m = Matrix.multiply(m, Matrix.scale(scaleX * (resolution / 1536), resolution / 1536));
  m = Matrix.multiply(m, Matrix.translate(-97 * 2, -97 * 2));

  const transformStr = `matrix(${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]}, ${m[5]})`;

  return {
    worldAX,
    worldAY,
    worldBX,
    worldBY,
    dx,
    dy,
    distance,
    midX,
    midY,
    angle,
    scaleX,
    matrix: m,
    transformStr,
  };
}
