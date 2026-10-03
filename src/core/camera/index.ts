import { State } from '../state';
import { SimpleMatrix6, Matrix } from '../../utils/mathTool';
import { CONFIG } from '../../utils/constants';

export const snapValue = (value: number): number => Math.round(value);

export const ZoomHelper = {
  getBaseZoom(vpHeight: number): number {
    return Math.min((CONFIG.baseInitialZoom * vpHeight) / CONFIG.referenceHeight, 1);
  },
  getMinZoom(vpHeight: number): number {
    return Math.min((CONFIG.baseMinZoom * vpHeight) / CONFIG.referenceHeight, 1);
  },
  getMaxZoom(vpHeight: number): number {
    return Math.min((CONFIG.baseMaxZoom * vpHeight) / CONFIG.referenceHeight, 1);
  },
  clamp(val: number, vpHeight: number): number {
    return Math.max(this.getMinZoom(vpHeight), Math.min(this.getMaxZoom(vpHeight), val));
  },
};

export const CoordinateSystem = {
  getCameraMatrix(): SimpleMatrix6 {
    const { x, y, scale } = State.camera;
    return Matrix.multiply(Matrix.scale(scale, scale), Matrix.translate(x, y));
  },
  getInverseCameraMatrix(): SimpleMatrix6 {
    return Matrix.inverse(this.getCameraMatrix());
  },
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return Matrix.transformPoint(this.getInverseCameraMatrix(), sx, sy);
  },
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return Matrix.transformPoint(this.getCameraMatrix(), wx, wy);
  },
};

export function updateContainerTransform(
  mapContainer: HTMLDivElement,
  zoomDisplay: HTMLSpanElement,
  footerCoord: HTMLDivElement,
  vpWidth: number,
  vpHeight: number
): void {
  const mat = CoordinateSystem.getCameraMatrix();
  mapContainer.style.transform = `matrix(${mat[0]}, ${mat[1]}, ${mat[2]}, ${mat[3]}, ${mat[4]}, ${mat[5]})`;

  const { scale } = State.camera;
  const worldPos = CoordinateSystem.screenToWorld(vpWidth / 2, vpHeight / 2);
  zoomDisplay.textContent = `${scale.toFixed(2)}x`;
  footerCoord.textContent = `X: ${snapValue(worldPos.x)} Y: ${snapValue(worldPos.y)}`;
}

export function drawWorldBounds(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const rect = State.data.mapConfig?.objdata?.m_boundingRect;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!rect) return;

  const resolution = State.data.textureResolution;
  const p1 = CoordinateSystem.worldToScreen((rect.mX * resolution) / 600, (rect.mY * resolution) / 600);
  const p2 = CoordinateSystem.worldToScreen(
    ((rect.mX + rect.mWidth) * resolution) / 600,
    ((rect.mY + rect.mHeight) * resolution) / 600
  );

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#C4A052';
  ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
}

export function resetCamera(
  targetCamera: { x: number; y: number; scale: number },
  vpWidth: number,
  vpHeight: number,
  updateCallback: () => void
): void {
  if (!State.data.mapConfig) {
    State.camera.x = 0;
    State.camera.y = 0;
    State.camera.scale = 1;
    targetCamera.x = 0;
    targetCamera.y = 0;
    targetCamera.scale = 1;
    updateCallback();
    return;
  }

  const scale = ZoomHelper.getBaseZoom(vpHeight);
  targetCamera.scale = scale;

  const eventList = State.data.mapConfig.objdata.m_eventList || [];
  let targetWorldX = 0;
  let targetWorldY = 0;

  if (eventList.length > 0) {
    const validEvents = eventList
      .filter((node) => node.m_position)
      .sort((a, b) => a.m_eventId - b.m_eventId);

    if (validEvents.length > 0) {
      const smallest = validEvents[0];
      targetWorldX = ((smallest.m_position?.x || 0) * State.data.textureResolution) / 600;
      targetWorldY = ((smallest.m_position?.y || 0) * State.data.textureResolution) / 600;
    }
  }

  targetCamera.x = vpWidth / 2 / scale - targetWorldX;
  targetCamera.y = vpHeight / 2 / scale - targetWorldY;

  const worldLeft = -targetCamera.x;
  const leftBoundary = ((State.data.mapConfig?.objdata?.m_boundingRect?.mX || 0) * State.data.textureResolution) / 600;
  if (worldLeft < leftBoundary) {
    targetCamera.x = -leftBoundary;
  }

  // Set initial camera instantly if it is near zero, otherwise slide smoothly
  if (Math.abs(State.camera.x) < 0.001 && Math.abs(State.camera.y) < 0.001) {
    State.camera.x = targetCamera.x;
    State.camera.y = targetCamera.y;
    State.camera.scale = targetCamera.scale;
  }
  updateCallback();
}
