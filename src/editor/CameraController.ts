/**
 * CameraController — target/current camera, inertia, lerp, parallax, bounds overlay.
 *
 * EditorApp.tick drives the frame; this module owns all camera-side math and DOM side-effects
 * that follow from camera motion (container transform, parallax roots, world-bounds canvas).
 */

import { State } from '../core/state';
import {
  CoordinateSystem,
  resetCamera,
  updateContainerTransform,
  drawWorldBounds,
} from '../core/camera';
import { DOM, BBox } from '../app/dom';
import { EditorState } from './EditorState';
import { parallaxOffsetX, parallaxScrollDx } from '../scene/coords';
import { tryGetLayerStack } from '../scene/LayerStack';

const BASE_FRICTION = 0.92;
const BASE_FRAME_MS = 1000 / 60;
const LERP_EPSILON = 0.001;

export type CameraOverlayHooks = {
  /** Optional isometric grid redraw when cameraDirty. */
  drawGrid?: () => void;
};

let overlayHooks: CameraOverlayHooks = {};

export const CameraController = {
  configure(hooks: CameraOverlayHooks): void {
    overlayHooks = hooks;
  },

  /** Push current State.camera into #map-container + UI readouts; mark dirty for parallax. */
  applyTransform(): void {
    const rect = DOM.viewport.getBoundingClientRect();
    updateContainerTransform(
      DOM.mapContainer,
      DOM.uiElements.zoomDisplay,
      DOM.uiElements.footerCoord,
      rect.width,
      rect.height
    );
    EditorState.cameraDirty = true;
  },

  /** Frame the map on the first event / bounds (smooth target). */
  reset(): void {
    const rect = DOM.viewport.getBoundingClientRect();
    resetCamera(EditorState.targetCamera, rect.width, rect.height, () => this.applyTransform());
  },

  /**
   * Coast with friction when not actively panning.
   * Mutates EditorState.targetCamera from interaction velocity.
   */
  applyInertia(dtMs: number): void {
    if (State.interaction.isDragging) return;
    const friction = Math.pow(BASE_FRICTION, dtMs / BASE_FRAME_MS);
    State.interaction.velocityX *= friction;
    State.interaction.velocityY *= friction;
    if (Math.abs(State.interaction.velocityX) > 0.05 || Math.abs(State.interaction.velocityY) > 0.05) {
      EditorState.targetCamera.x += State.interaction.velocityX;
      EditorState.targetCamera.y += State.interaction.velocityY;
    }
  },

  /**
   * Ease State.camera toward targetCamera. Returns true if the camera moved.
   */
  lerpTowardTarget(dtSeconds: number): boolean {
    const diffX = EditorState.targetCamera.x - State.camera.x;
    const diffY = EditorState.targetCamera.y - State.camera.y;
    const diffS = EditorState.targetCamera.scale - State.camera.scale;

    if (
      Math.abs(diffX) <= LERP_EPSILON &&
      Math.abs(diffY) <= LERP_EPSILON &&
      Math.abs(diffS) <= LERP_EPSILON
    ) {
      return false;
    }

    const lerpingSpeed = State.interaction.isDragging ? 1.0 : 1 - Math.pow(0.01, dtSeconds);
    State.camera.x += diffX * lerpingSpeed;
    State.camera.y += diffY * lerpingSpeed;
    State.camera.scale += diffS * lerpingSpeed;
    this.applyTransform();
    return true;
  },

  /**
   * When cameraDirty: update parallax roots, world-bounds canvas, optional grid.
   * Call once per frame after lerp.
   */
  flushDirtyOverlays(): void {
    if (!EditorState.cameraDirty) return;

    if (State.data.mapConfig) {
      const dx = parallaxScrollDx();
      const stack = tryGetLayerStack();
      if (stack) {
        stack.applyParallax(dx);
      } else {
        State.data.parallaxRoots.forEach((root, layer) => {
          root.style.transform = `translateX(${parallaxOffsetX(layer, dx)}px)`;
        });
      }

      if (BBox.canvas && BBox.ctx) {
        const check = document.getElementById('bounding-rect-checkbox') as HTMLInputElement | null;
        if (!check || check.checked) {
          drawWorldBounds(BBox.canvas, BBox.ctx);
        } else {
          BBox.ctx.clearRect(0, 0, BBox.canvas.width, BBox.canvas.height);
        }
      }
    } else if (BBox.canvas && BBox.ctx) {
      BBox.ctx.clearRect(0, 0, BBox.canvas.width, BBox.canvas.height);
    }

    overlayHooks.drawGrid?.();
    EditorState.cameraDirty = false;
  },

  /** One frame of camera simulation (inertia + lerp + overlays). */
  tickFrame(dtMs: number, dtSeconds: number): void {
    this.applyInertia(dtMs);
    this.lerpTowardTarget(dtSeconds);
    this.flushDirtyOverlays();
  },
};
