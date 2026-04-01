import * as THREE from 'three/webgpu';
import WebGPUContext from './WebGPUContext.js';
import Scene from './Scene.js';
import MouseTrail from './MouseTrail.js';
import FluidSim from './FluidSim.js';
import PostProcessing from './PostProcessing.js';

class ThreeApp {
  constructor() {
    this.clock = new THREE.Clock();
  }

  async run() {
    this.context = new WebGPUContext();
    await this.context.init();

    this.#setup();
    this.#animate();
    this.#addResizeListener();
  }

  #setup() {
    const { width, height } = this.context.getFullScreenDimensions();
    const pr = this.context.pixelRatio;
    this.scene = new Scene();
    this.mouseTrail = new MouseTrail(width * pr, height * pr);
    this.fluidSim = new FluidSim(width * pr, height * pr);

    this.postProcessing = new PostProcessing(
      this.context.renderer,
      this.scene.solidScene,
      this.scene.wireScene,
      this.scene.camera,
      this.fluidSim.texture,
    );
  }

  #animate() {
    const delta = this.clock.getDelta();

    this.scene.animate(delta, this.clock.elapsedTime);

    this.mouseTrail.update(
      this.scene.cameraRig.mouseNormalized.x,
      this.scene.cameraRig.mouseNormalized.y,
    );
    this.fluidSim.update(this.context.renderer, this.mouseTrail.texture);

    this.postProcessing.render();

    requestAnimationFrame(() => this.#animate());
  }

  #addResizeListener() {
    window.addEventListener('resize', () => this.#onResize());
  }

  #onResize() {
    const { width, height } = this.context.getFullScreenDimensions();
    const pr = this.context.pixelRatio;

    this.context.onResize(width, height);
    this.scene.onResize(width, height);
    this.fluidSim.onResize(width * pr, height * pr);
  }
}

export default ThreeApp;
