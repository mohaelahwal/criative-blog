import * as THREE from 'three/webgpu';
import { easing } from 'maath';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;

    this.basePos = new THREE.Vector3(1.5, 1.5, 0.55);
    this.lookAt = new THREE.Vector3(-0.52, 0.45, -0.45);

    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.lookAt);

    this.mouseNormalized = { x: 0.5, y: 0.5 };
    this.pointer = { x: 0, y: 0 };

    this.smoothTime = 0.25;
    this.touchTime = 0;

    this.isTouch =
      window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.isMobile = window.innerWidth < 768;

    this._targetPos = [0, 0, 0];

    if (!this.isTouch) {
      window.addEventListener('mousemove', (e) => {
        this.mouseNormalized.x = e.clientX / window.innerWidth;
        this.mouseNormalized.y = 1 - e.clientY / window.innerHeight;
        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      });
    }
  }

  update(delta, elapsed) {
    let pointerX, pointerY;

    if (this.isTouch) {
      this.touchTime += delta * 0.5;
      pointerX = Math.sin(this.touchTime);
      pointerY = Math.sin(this.touchTime * 0.7) * 0.5;

      const trailT = elapsed * 1.3;
      const tx = Math.sin(trailT);
      const ty = Math.sin(trailT * 2.0);
      this.mouseNormalized.x = 0.5 + tx * 0.5;
      this.mouseNormalized.y = 0.5 + ty * 0.5;
    } else {
      pointerX = this.pointer.x;
      pointerY = this.pointer.y;
    }

    const zoom = this.isMobile ? 1.2 : 1;

    this._targetPos[0] =
      this.lookAt.x + (this.basePos.x - this.lookAt.x) * zoom + pointerX * 0.125;
    this._targetPos[1] =
      this.lookAt.y + (this.basePos.y - this.lookAt.y) * zoom + pointerY * 0.075;
    this._targetPos[2] =
      this.lookAt.z + (this.basePos.z - this.lookAt.z) * zoom;

    easing.damp3(this.camera.position, this._targetPos, this.smoothTime, delta);
    this.camera.lookAt(this.lookAt);
  }
}
