import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(dracoLoader);

export default class ImportGltf {
  constructor(url, { onLoad }) {
    this.ready = new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          onLoad?.(gltf.scene);
          resolve();
        },
        undefined,
        (error) => {
          console.error('GLTF load error:', error);
          reject(error);
        },
      );
    });
  }
}
