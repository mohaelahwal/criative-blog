import * as THREE from 'three/webgpu';

class WebGPUContext {
  constructor() {
    if (WebGPUContext.instance) {
      return WebGPUContext.instance;
    }

    this.renderer = null;
    this.canvas = null;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2.0);

    WebGPUContext.instance = this;
  }

  async init() {
    this.canvas = this.#createCanvas();
    this.renderer = new THREE.WebGPURenderer({
      canvas: this.canvas,
      antialias: false,
    });

    await this.renderer.init();

    const { width, height } = this.getFullScreenDimensions();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  getFullScreenDimensions() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  #createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  onResize(width, height) {
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.pixelRatio);
  }
}

export default WebGPUContext;
