import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const COUNTER_Y = 0.9; // height of the counter top (meters)
export const STATION_Z = -0.05; // depth where items sit on the counter
export const WALL_Z = -0.75; // the front wall with the serving window
export const WINDOW = { left: -1.25, right: 1.75, bottom: 1.0, top: 2.15 };
export const NIGHT = 0x1a1030;

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

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const tileTex = canvasTexture(128, 128, (g) => {
  g.fillStyle = '#efe6d8';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#c9bba5';
  g.lineWidth = 4;
  g.strokeRect(0, 0, 128, 128);
});
tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
const tileMat = std(0xffffff, { map: tileTex, roughness: 0.5 });

/** A tiled wall block whose tiles stay 25cm wide whatever its size. */
function wallBlock(w, h, x, y) {
  const geo = new THREE.BoxGeometry(w, h, 0.1);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 4, uv.getY(i) * h * 4);
  const mesh = new THREE.Mesh(geo, tileMat);
  mesh.position.set(x, y, WALL_Z);
  mesh.receiveShadow = true;
  return mesh;
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
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.Fog(NIGHT, 14, 40);

  // Soft image-based lighting gives every material gentle reflections and fill light.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 200);

  // Post-processing: bloom makes anything brighter than white (neon, lasers, string lights) glow.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.55, 1.25);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  resize();

  // Lights (warm kitchen; the party brings its own colored lights)
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4a3226, 0.75));
  const key = new THREE.DirectionalLight(0xfff6e8, 1.8);
  key.position.set(0.6, 3, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004;
  scene.add(key);

  // Kitchen floor (inside only; the party has its own ground)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), std(0x5a3d2e));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0.2, 0, WALL_Z + 1.5);
  floor.receiveShadow = true;
  scene.add(floor);

  // Front wall with a big serving window cut out of it
  const L = -2.8;
  const R = 3.2;
  const H = 2.6;
  const W = WINDOW;
  scene.add(
    wallBlock(R - L, W.bottom, (L + R) / 2, W.bottom / 2),
    wallBlock(R - L, H - W.top, (L + R) / 2, (W.top + H) / 2),
    wallBlock(W.left - L, W.top - W.bottom, (L + W.left) / 2, (W.bottom + W.top) / 2),
    wallBlock(R - W.right, W.top - W.bottom, (W.right + R) / 2, (W.bottom + W.top) / 2)
  );

  // Window trim + sill
  const trim = std(0xffc23d, { roughness: 0.4 });
  const ww = W.right - W.left;
  const wx = (W.left + W.right) / 2;
  const wh = W.top - W.bottom;
  const addBox = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  addBox(ww + 0.16, 0.08, 0.16, wx, W.top, WALL_Z, trim);
  addBox(0.08, wh, 0.16, W.left, W.bottom + wh / 2, WALL_Z, trim);
  addBox(0.08, wh, 0.16, W.right, W.bottom + wh / 2, WALL_Z, trim);
  addBox(ww + 0.16, 0.05, 0.36, wx, W.bottom, WALL_Z - 0.02, std(0xd9412b, { roughness: 0.5 }));

  // Striped awning outside the window
  const stripes = canvasTexture(256, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#fff4dc' : '#d9412b';
      g.fillRect(i * 32, 0, 32, 64);
    }
  });
  const awning = new THREE.Mesh(
    new THREE.PlaneGeometry(ww + 0.4, 0.8),
    std(0xffffff, { map: stripes, side: THREE.DoubleSide })
  );
  awning.rotation.x = -Math.PI / 2 - 0.45;
  awning.position.set(wx, 2.32, WALL_Z - 0.38);
  scene.add(awning);

  // Small menu board above the window
  addBox(1.6, 0.32, 0.03, wx, 2.4, WALL_Z + 0.06, std(0x1f1a17, { roughness: 0.4 }));
  for (let i = 0; i < 4; i++) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.22),
      new THREE.MeshBasicMaterial({ color: [0xffc23d, 0xff7a3d, 0xffe6a0, 0xff9d5c][i] })
    );
    glow.position.set(wx - 0.6 + i * 0.4, 2.4, WALL_Z + 0.08);
    scene.add(glow);
  }

  // Counter: cabinet + steel top
  const cabinet = addBox(3.4, COUNTER_Y - 0.03, 0.95, 0.2, (COUNTER_Y - 0.03) / 2, -0.2, std(0xb5462f));
  cabinet.castShadow = false;
  addBox(3.5, 0.03, 1.0, 0.2, COUNTER_Y - 0.015, -0.2, std(0xaeb3ba, { metalness: 0.35, roughness: 0.55 }));

  return { renderer, scene, camera, composer, resize };
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Follows the active station, looks up at the window when serving, shakes on mistakes. */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.focusX = 0;
    this.x = 0;
    this.up = 1;
    this.upTarget = 1;
    this.shake = 0;
    this.time = 0;
  }

  focus(x) {
    this.focusX = x;
  }

  /** true = look out the window at the customers, false = look down at the counter. */
  lookUp(on) {
    this.upTarget = on ? 1 : 0;
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt) {
    this.time += dt;
    this.x += (this.focusX - this.x) * (1 - Math.exp(-dt * 6));
    this.up += (this.upTarget - this.up) * (1 - Math.exp(-dt * 5));
    this.shake = Math.max(0, this.shake - dt * 3);
    const s = this.shake * this.shake;
    const ox = (Math.random() - 0.5) * s * 0.05;
    const oy = (Math.random() - 0.5) * s * 0.05;
    const breathe = Math.sin(this.time * 1.3) * 0.004;
    const u = this.up;
    this.camera.position.set(this.x * 0.85 + ox, 1.46 + u * 0.06 + oy + breathe, 0.66);
    this.camera.lookAt(this.x, lerp(COUNTER_Y - 0.02, 1.5, u), lerp(STATION_Z + 0.02, -2.6, u));
  }
}
