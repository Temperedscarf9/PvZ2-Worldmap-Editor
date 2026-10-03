/**
 * ViewportOverlays — bounding-rect canvas + optional isometric grid.
 * Wired into CameraController.flushDirtyOverlays via configure().
 */

import { DOM, BBox } from '../app/dom';
import { EditorState } from './EditorState';
import { CameraController } from './CameraController';

export function initBBox(): void {
  const c = BBox.canvas;
  if (!c) return;
  c.width = DOM.viewport.clientWidth;
  c.height = DOM.viewport.clientHeight;
  BBox.ctx = c.getContext('2d');
  EditorState.cameraDirty = true;
}

export function drawIsometricGrid(): void {
  const canvas = document.getElementById('grid-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const check = document.getElementById('isometric-grid-checkbox') as HTMLInputElement | null;
  if (!check || !check.checked) return;

  canvas.width = DOM.viewport.clientWidth;
  canvas.height = DOM.viewport.clientHeight;

  const camera = EditorState.targetCamera;
  const zoom = camera.scale;

  ctx.save();
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.translate(cx + camera.x, cy + camera.y);
  ctx.scale(zoom, zoom);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1 / zoom;

  const spacing = 150;
  const limit = 3000;

  for (let i = -limit; i <= limit; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(-limit, i - limit * 0.5);
    ctx.lineTo(limit, i + limit * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-limit, i + limit * 0.5);
    ctx.lineTo(limit, i - limit * 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

/** Bind overlay redraw into the camera tick and size canvases to the viewport. */
export function bindViewportOverlays(): void {
  CameraController.configure({ drawGrid: drawIsometricGrid });
  initBBox();
}

/** Resize handler: re-fit canvases and reframe camera. */
export function onViewportResize(resetCamera: () => void): void {
  initBBox();
  EditorState.cameraDirty = true;
  resetCamera();
}
