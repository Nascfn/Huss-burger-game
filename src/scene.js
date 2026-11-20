import * as THREE from 'three';

export const COUNTER_Y = 0.9; // height of the counter top (meters)
export const STATION_Z = -0.05; // depth where items sit on the counter

export function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
}

export function shadowify(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d8';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9bba5';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b1d16);
  scene.fog = new THREE.Fog(0x2b1d16, 3, 7);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 50);

  // Lights
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4a3226, 1.3));
  const key = new THREE.DirectionalLight(0xfff6e8, 2.4);
  key.position.set(0.6, 3, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004;
  scene.add(key);

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), std(0x5a3d2e));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall with tiles
  const tiles = tileTexture();
  tiles.repeat.set(24, 8);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), std(0xffffff, { map: tiles, roughness: 0.5 }));
  wall.position.set(0.2, 1.2, -0.75);
  wall.receiveShadow = true;
  scene.add(wall);

  // Counter: cabinet + steel top
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(3.4, COUNTER_Y - 0.03, 0.95), std(0xb5462f));
  cabinet.position.set(0.2, (COUNTER_Y - 0.03) / 2, -0.2);
  cabinet.receiveShadow = true;
  scene.add(cabinet);
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.03, 1.0),
    std(0xc8ccd0, { metalness: 0.6, roughness: 0.35 })
  );
  top.position.set(0.2, COUNTER_Y - 0.015, -0.2);
  top.receiveShadow = true;
  scene.add(top);

  // Menu board on the wall
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.03), std(0x1f1a17, { roughness: 0.4 }));
  board.position.set(0.2, 1.75, -0.72);
  scene.add(board);
  for (let i = 0; i < 4; i++) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.26),
      new THREE.MeshBasicMaterial({ color: [0xffc23d, 0xff7a3d, 0xffe6a0, 0xff9d5c][i] })
    );
    glow.position.set(-0.4 + i * 0.4, 1.75, -0.7);
    scene.add(glow);
  }

  return { renderer, scene, camera };
}

/** Follows the active station and shakes on mistakes. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.focusX = 0;
    this.x = 0;
    this.shake = 0;
    this.time = 0;
  }

  focus(x) {
    this.focusX = x;
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt) {
    this.time += dt;
    this.x += (this.focusX - this.x) * (1 - Math.exp(-dt * 6));
    this.shake = Math.max(0, this.shake - dt * 3);
    const s = this.shake * this.shake;
    const ox = (Math.random() - 0.5) * s * 0.05;
    const oy = (Math.random() - 0.5) * s * 0.05;
    const breathe = Math.sin(this.time * 1.3) * 0.004;
    this.camera.position.set(this.x * 0.85 + ox, 1.46 + oy + breathe, 0.66);
    this.camera.lookAt(this.x, COUNTER_Y - 0.02, STATION_Z + 0.02);
  }
}
