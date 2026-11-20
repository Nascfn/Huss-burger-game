// The party outside the window. Each level builds a different party (see levels.js),
// plus the line of hungry guests that walk up to the window.
import * as THREE from 'three';
import { WALL_Z } from './scene.js';
import {
  makePerson, disposePerson, setFace, FACE, personMaterial, block, box, paint, merged,
  poseDance, poseWalk, poseWait, poseHold, HOLD_POINT,
} from './people.js';
import { tween, ease } from './tween.js';

const NAMES = ['Jess', 'Big Mike', 'Kev', 'Tasha', 'Rico', 'Lulu', 'Marco', 'Priya', 'Dante', 'Zoe', 'Gus', 'Nia', 'Theo', 'Kiki', 'Omar', 'Bea', 'Sal', 'Ivy', 'Rosa', 'Finn', 'Maya', 'Leo'];
const ITEM_EMOJI = { burger: '🍔', fries: '🍟', drink: '🥤' };
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const NEON = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0xff7a3d, 0x9b5cff];

export const SERVE_X = 1.05; // the window spot lines up with the bag station
const QUEUE_SPOTS = [
  new THREE.Vector3(SERVE_X, 0, WALL_Z - 0.33),
  new THREE.Vector3(0.5, 0, -1.85),
  new THREE.Vector3(1.55, 0, -2.3),
  new THREE.Vector3(0.75, 0, -2.95),
  new THREE.Vector3(1.4, 0, -3.5),
];
const STAGE_Z = -15.5;
const MAX_HOLDERS = 12;
// Which dance moves each energy level uses (see poseDance).
const STYLES = [[3, 3, 3, 1], [3, 1, 1, 0, 3], [1, 0, 2, 3, 0], [0, 1, 2, 4, 0], [0, 2, 4, 4, 2, 0]];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
/** A color brighter than 1.0 so the bloom pass makes it glow. */
const glow = (hex, k = 2.5) => new THREE.Color(hex).multiplyScalar(k);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- speech bubble ----------

const MOOD_COLORS = { idle: '#2b1d16', happy: '#5fd068', ok: '#ffc23d', angry: '#d9412b', love: '#ff5fa2' };

function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 150;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false }));
  return { sprite, canvas, tex };
}

function drawBubble(b, text, mood) {
  const g = b.canvas.getContext('2d');
  const W = b.canvas.width;
  const H = b.canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.strokeStyle = MOOD_COLORS[mood];
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(W / 2 - 20, H - 40);
  g.lineTo(W / 2, H - 6);
  g.lineTo(W / 2 + 20, H - 40);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 46, 30);
  g.fill();
  g.stroke();
  g.font = `60px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, (H - 38) / 2 + 6);
  b.tex.needsUpdate = true;
}

// ---------- one party guest ----------

class Guest {
  constructor(parent, opts) {
    this.p = makePerson(opts);
    parent.add(this.p.root);
    this.mode = 'dance';
    this.style = 0;
    this.phase = Math.random() * 0.3;
    this.t = Math.random() * 10;
    this.speed = rand(1.7, 2.1);
    this.bubble = null;
    this.order = null;
    this.name = '';
  }

  get root() {
    return this.p.root;
  }

  walkTo(pos, then = 'wait', faceY = 0) {
    this.target = pos.clone();
    this.mode = 'walk';
    this.after = { then, faceY };
    this.arrived = new Promise((res) => (this.resolveArrive = res));
    return this.arrived;
  }

  showBubble(text, mood = 'idle') {
    if (!this.bubble) {
      this.bubble = makeBubble();
      this.root.add(this.bubble.sprite);
    }
    this.bubbleText = text;
    this.mood = mood;
    drawBubble(this.bubble, text, mood);
  }

  setMood(mood) {
    if (mood === this.mood) return;
    if (this.bubble) this.showBubble(this.bubbleText, mood);
    this.mood = mood;
    const faces = { happy: FACE.grin, ok: FACE.neutral, angry: FACE.angry, love: FACE.love, meh: FACE.meh };
    if (faces[mood] !== undefined) setFace(this.p, faces[mood]);
  }

  hideBubble() {
    if (!this.bubble) return;
    this.root.remove(this.bubble.sprite);
    this.bubble.tex.dispose();
    this.bubble.sprite.material.dispose();
    this.bubble = null;
  }

  /** The guest at the window gets a bigger bubble beside their head so the window frame doesn't cut it off. */
  setBubbleSlot(atWindow) {
    if (!this.bubble) return;
    const m = atWindow ? 1.1 : 0.85;
    this.bubble.sprite.scale.set(0.5 * m, 0.234 * m, 1);
    if (atWindow) this.bubble.sprite.position.set(0.48, 1.62, 0);
    else this.bubble.sprite.position.set(0, 2.1, 0);
  }

  shout(big = 1) {
    if (!this.bubble) return;
    const s = this.bubble.sprite;
    const base = s.scale.x / 0.5;
    tween(0.35, (k) => {
      const m = base * big * (1 + Math.sin(k * Math.PI) * 0.25);
      s.scale.set(0.5 * m, 0.234 * m, 1);
    }, ease.outCubic);
  }

  handWorld() {
    return this.root.localToWorld(HOLD_POINT.clone());
  }

  hold(obj) {
    this.root.attach(obj);
  }

  update(dt, beat, isFront) {
    this.t += dt;
    const p = this.p;
    if (this.mode === 'walk') {
      const pos = this.root.position;
      const dx = this.target.x - pos.x;
      const dz = this.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (dist <= step) {
        pos.set(this.target.x, pos.y, this.target.z);
        this.mode = this.after.then;
        this.root.rotation.y = this.after.faceY;
        this.resolveArrive?.();
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        this.root.rotation.y = Math.atan2(dx, dz);
        poseWalk(p, this.t);
      }
    } else if (this.mode === 'dance') {
      poseDance(p, beat + this.phase, this.style);
    } else if (this.mode === 'wait') {
      poseWait(p, this.t, isFront);
    } else if (this.mode === 'hold') {
      poseHold(p, beat + this.phase);
    }
  }

  dispose() {
    this.hideBubble();
    this.root.removeFromParent();
    disposePerson(this.p);
  }
}

// ---------- the party ----------

export class Party {
  constructor(scene) {
    this.scene = scene;
    this.guests = [];
    this.queue = [];
    this.pending = [];
    this.holders = [];
    this.time = 0;
    this.level = null;
  }

  get levelId() {
    return this.level?.id;
  }

  /** Tear down the current party and build the one for `level`. */
  setLevel(level) {
    this.clear();
    this.level = level;
    this.group = new THREE.Group();
    this.crowdGroup = new THREE.Group();
    this.scene.add(this.group, this.crowdGroup);
    this.updaters = [];
    this.avoid = [];
    this.lights = [];
    // Fog blends the far ground into the sky's horizon so there's no hard seam.
    const fog = new THREE.Color(level.sky.horizon).lerp(new THREE.Color(level.sky.top), 0.45).multiplyScalar(0.7);
    this.scene.fog.color.copy(fog);
    this.scene.background.set(level.sky.top);

    const P = level.props;
    this.buildSky(level);
    this.buildGround(level);
    if (P.stars) this.buildStars();
    if (P.trees) this.buildTrees();
    if (P.fence) this.buildFence();
    if (P.buildings) this.buildBuildings();
    if (P.streetlights) this.buildStreetlights();
    if (P.grill) this.buildGrill();
    for (let i = 0; i < (P.picnic || 0); i++) this.buildPicnicTable(i);
    if (P.boombox) this.buildBoombox();
    if (P.cake) this.buildCake();
    if (P.banner) this.buildBanner();
    if (P.balloons) this.buildBalloons(P.balloons);
    if (P.djTable) this.buildDjTable();
    if (P.stage) this.buildStage(P.stage, level.energy >= 4);
    if (P.danceFloor) this.buildDanceFloor();
    if (P.beams) this.buildBeams(P.beams);
    if (P.lasers) this.buildLasers(P.lasers);
    if (P.fireworks) this.buildFireworks();
    this.buildStrands(P.strands || 0);
    this.buildLights(level);
    this.buildConfetti(level.confetti);
    this.buildCrowd(level);
  }

  clear() {
    for (const g of this.guests) g.dispose();
    this.guests = [];
    this.queue = [];
    this.holders = [];
    this.pending = [];
    if (this.group) {
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          if (m === personMaterial) continue;
          m.map?.dispose();
          m.emissiveMap?.dispose();
          m.dispose();
        }
      });
      this.group.removeFromParent();
      this.crowdGroup.removeFromParent();
    }
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  /** A merged block-prop mesh using the shared vertex-color material. */
  prop(parts, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(merged(parts), personMaterial);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return this.add(m);
  }

  blockOut(x0, x1, z0, z1) {
    this.avoid.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  }

  // ----- sky & ground -----

  buildSky(level) {
    const geo = new THREE.SphereGeometry(90, 32, 20);
    const top = new THREE.Color(level.sky.top);
    const hor = new THREE.Color(level.sky.horizon);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / 90 / 0.55, 0, 1);
      c.copy(hor).lerp(top, Math.pow(t, 0.6));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.set(0, -4, -10);
    sky.renderOrder = -10;
    this.add(sky);
  }

  buildGround(level) {
    let mat;
    if (level.ground === 'grass') {
      const tex = canvasTex(256, 256, (g) => {
        g.fillStyle = '#2f5a2a';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = pick(['#3a6b31', '#28502a', '#447a36', '#2a4f24']);
          g.fillRect(Math.random() * 256, Math.random() * 256, 3, 6);
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(30, 25);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    } else if (level.ground === 'street') {
      const tex = canvasTex(256, 256, (g) => {
        g.fillStyle = '#2b2a30';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 3000; i++) {
          g.fillStyle = pick(['#34333a', '#25242a', '#3b3a42']);
          g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(20, 16);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      // Lane markings + curbs
      const marks = [];
      for (let z = -2; z > -24; z -= 2.2) marks.push(box(0.15, 0.01, 1.1, 0xf2c94c, 0, 0.006, z));
      for (const x of [-7.6, 7.6]) marks.push(box(1.4, 0.15, 40, 0x8a8790, x, 0.075, -18));
      this.prop(marks);
    } else {
      mat = new THREE.MeshStandardMaterial({ color: 0x1b1828, roughness: 0.85 });
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.001, WALL_Z - 30);
    ground.receiveShadow = true;
    this.add(ground);
  }

  buildStars() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(0.15, 1.4);
      const r = 80;
      pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 4, Math.sin(a) * Math.cos(e) * r - 10], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.25, color: 0xffffff, fog: false })));
  }

  // ----- backyard / birthday props -----

  buildTrees() {
    const spots = [[-6.8, -6], [7, -5.2], [-4.2, -12], [5.2, -12.5], [0.8, -14], [-8.5, -10], [9, -9.5], [-2, -15]];
    for (const [x, z] of spots) {
      const s = rand(0.85, 1.25);
      const greens = [0x2f7a3a, 0x3d8c40, 0x27673a];
      this.prop([
        block(0.36, 1.7, 0.36, 0x6b4423, 0, 0.85, 0, 0.05),
        block(1.7, 1.2, 1.7, pick(greens), 0, 2.2, 0, 0.18),
        block(1.25, 0.9, 1.25, pick(greens), 0.1, 3.0, -0.05, 0.15),
        block(0.7, 0.55, 0.7, pick(greens), -0.05, 3.6, 0.05, 0.12),
      ], x, 0, z).scale.setScalar(s);
      this.blockOut(x - 0.9, x + 0.9, z - 0.9, z + 0.9);
    }
  }

  buildFence() {
    const parts = [];
    const z = -16.5;
    for (let x = -14; x <= 14; x += 0.3) parts.push(box(0.24, 1.2, 0.05, 0xc9a271, x, 0.6, z));
    parts.push(box(28.5, 0.1, 0.08, 0xa8814f, 0, 0.35, z + 0.05), box(28.5, 0.1, 0.08, 0xa8814f, 0, 0.95, z + 0.05));
    this.prop(parts);
  }

  buildGrill() {
    const x = -3.6;
    const z = -5.2;
    this.prop([
      block(0.9, 0.45, 0.55, 0x2a2a30, 0, 0.82, 0, 0.08),
      box(0.06, 0.6, 0.06, 0x444448, -0.35, 0.3, -0.2), box(0.06, 0.6, 0.06, 0x444448, 0.35, 0.3, -0.2),
      box(0.06, 0.6, 0.06, 0x444448, -0.35, 0.3, 0.2), box(0.06, 0.6, 0.06, 0x444448, 0.35, 0.3, 0.2),
      block(0.9, 0.08, 0.5, 0x2a2a30, 0, 1.25, -0.3, 0.03), // open lid
    ], x, 0, z);
    // Glowing coals + burgers on the grill
    const coals = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.44).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: glow(0xff6a1f, 2.2) }));
    coals.position.set(x, 1.055, z);
    this.add(coals);
    const patties = [];
    for (let i = 0; i < 4; i++) patties.push(block(0.14, 0.035, 0.14, 0x5a3218, -0.27 + i * 0.18, 1.075, 0.03, 0.015));
    this.prop(patties, x, 0, z);
    this.updaters.push((dt, beat) => {
      coals.material.color.copy(glow(0xff6a1f, 1.8 + Math.sin(this.time * 7) * 0.4));
    });
    this.blockOut(x - 0.7, x + 0.7, z - 0.6, z + 0.6);
    // The grill master
    const chef = new Guest(this.crowdGroup, { partyHatChance: 0 });
    chef.root.position.set(x, 0, z + 0.75);
    chef.root.rotation.y = Math.PI;
    chef.style = 3;
    this.guests.push(chef);
  }

  buildPicnicTable(i) {
    const [x, z] = [[2.9, -6.4], [-1.4, -8.8]][i % 2];
    const wood = 0xa8743f;
    const parts = [
      block(2.0, 0.08, 0.85, wood, 0, 0.76, 0, 0.02),
      block(2.0, 0.06, 0.3, wood, 0, 0.45, 0.62, 0.02),
      block(2.0, 0.06, 0.3, wood, 0, 0.45, -0.62, 0.02),
      box(0.08, 0.76, 0.08, 0x8a5c2f, -0.85, 0.38, 0.3), box(0.08, 0.76, 0.08, 0x8a5c2f, 0.85, 0.38, 0.3),
      box(0.08, 0.76, 0.08, 0x8a5c2f, -0.85, 0.38, -0.3), box(0.08, 0.76, 0.08, 0x8a5c2f, 0.85, 0.38, -0.3),
    ];
    // Red party cups + a chip bowl
    for (let k = 0; k < 4; k++) parts.push(paint(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 10).translate(rand(-0.8, 0.8), 0.86, rand(-0.3, 0.3)), 0xe23b3b));
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.1, 0.08, 14).translate(0.2, 0.84, 0), 0xffd23f));
    this.prop(parts, x, 0, z);
    this.blockOut(x - 1.1, x + 1.1, z - 0.9, z + 0.9);
  }

  buildBoombox() {
    const x = 2.9;
    const z = -6.4;
    const bb = this.prop([
      block(0.6, 0.32, 0.2, 0x2b2b33, 0, 0.16, 0, 0.05),
      block(0.4, 0.04, 0.04, 0x888899, 0, 0.36, 0, 0.02),
      paint(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20).rotateX(Math.PI / 2).translate(-0.17, 0.16, 0.105), 0x111116),
      paint(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 20).rotateX(Math.PI / 2).translate(0.17, 0.16, 0.105), 0x111116),
    ], x - 0.4, 0.8, z + 0.05);
    bb.rotation.y = 0.4;
    this.updaters.push((dt, beat, pulse) => bb.scale.setScalar(1 + pulse * 0.05));
  }

  buildCake() {
    const x = -3.3;
    const z = -6.2;
    const parts = [
      block(1.4, 0.06, 0.8, 0xffffff, 0, 0.76, 0, 0.02),
      box(1.3, 0.7, 0.7, 0xff9ec8, 0, 0.38, 0),
      paint(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24).translate(0, 0.89, 0), 0xffe6f0),
      paint(new THREE.CylinderGeometry(0.31, 0.31, 0.04, 24).translate(0, 0.97, 0), 0xff5fa2),
      paint(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 24).translate(0, 1.06, 0), 0xffe6f0),
    ];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push(box(0.02, 0.1, 0.02, pick(NEON), Math.cos(a) * 0.12, 1.18, Math.sin(a) * 0.12));
    }
    this.prop(parts, x, 0, z);
    const flameMat = new THREE.MeshBasicMaterial({ color: glow(0xffb040, 3) });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), flameMat);
      f.scale.y = 1.6;
      f.position.set(x + Math.cos(a) * 0.12, 1.25, z + Math.sin(a) * 0.12);
      this.add(f);
    }
    this.blockOut(x - 0.8, x + 0.8, z - 0.5, z + 0.5);
  }

  buildBanner() {
    const tex = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#fff4dc';
      g.fillRect(0, 0, w, h);
      const text = 'HAPPY BIRTHDAY!';
      g.font = 'bold 104px Bungee, Impact, sans-serif';
      g.textBaseline = 'middle';
      let x = 40;
      [...text].forEach((ch, i) => {
        g.fillStyle = ['#ff3cac', '#2bd2ff', '#ffb000', '#3cc35a', '#9b5cff'][i % 5];
        g.fillText(ch, x, h / 2 + 6);
        x += g.measureText(ch).width + 4;
      });
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.94), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    banner.position.set(-0.3, 3.0, -9.2);
    this.add(banner);
    this.prop([block(0.1, 3.5, 0.1, 0xffffff, -3.4, 1.75, -9.2, 0.03), block(0.1, 3.5, 0.1, 0xffffff, 2.8, 1.75, -9.2, 0.03)]);
    this.updaters.push(() => (banner.rotation.x = Math.sin(this.time * 1.3) * 0.05));
  }

  buildBalloons(clusters) {
    const geo = new THREE.SphereGeometry(0.22, 18, 14);
    const spots = [[-5.5, -4.6], [5.8, -4.4], [-3.4, -9.5], [3.4, -9.6], [-6.5, -12], [6.5, -12], [-1.2, -11.8], [1.8, -4.8]];
    for (let c = 0; c < clusters; c++) {
      const [x, z] = spots[c % spots.length];
      const cluster = new THREE.Group();
      cluster.position.set(x, 0, z);
      const strings = [];
      for (let k = 0; k < 4; k++) {
        const color = pick(NEON);
        const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05, emissive: color, emissiveIntensity: 0.15 }));
        b.scale.y = 1.18;
        const bx = rand(-0.35, 0.35);
        const by = rand(2.3, 3.0);
        const bz = rand(-0.35, 0.35);
        b.position.set(bx, by, bz);
        b.userData.base = by;
        b.userData.ph = Math.random() * 6;
        cluster.add(b);
        strings.push(new THREE.Vector3(0, 1.0, 0), new THREE.Vector3(bx, by - 0.25, bz));
      }
      cluster.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strings), new THREE.LineBasicMaterial({ color: 0xffffff })));
      cluster.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.25).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })));
      this.add(cluster);
      this.blockOut(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
      this.updaters.push(() => {
        for (const b of cluster.children) if (b.userData.base) b.position.y = b.userData.base + Math.sin(this.time * 1.6 + b.userData.ph) * 0.06;
      });
    }
  }

  // ----- block party props -----

  buildBuildings() {
    const winTex = (lit) =>
      canvasTex(256, 256, (g) => {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++) {
            g.fillStyle = Math.random() < lit ? pick(['#ffd98a', '#ffe9b8', '#ffb86b', '#9ad7ff']) : '#15151c';
            g.fillRect(c * 64 + 14, r * 64 + 12, 36, 40);
          }
      });
    const texes = [winTex(0.55), winTex(0.4)];
    texes.forEach((t) => (t.wrapS = t.wrapT = THREE.RepeatWrapping));
    let x = -18;
    while (x < 18) {
      const w = rand(3.2, 5);
      const h = rand(6, 13);
      const geo = new THREE.BoxGeometry(w, h, 4);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 4, (uv.getY(i) * h) / 4);
      const tex = pick(texes);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: pick([0x5a4a6a, 0x6a4a3a, 0x3a4a6a, 0x5a5a62, 0x7a3a3a]),
        roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6,
      }));
      m.position.set(x + w / 2, h / 2, -22);
      this.add(m);
      x += w + rand(0.1, 0.6);
    }
  }

  buildStreetlights() {
    for (const [x, z] of [[-6.6, -5], [6.6, -5], [-6.6, -12], [6.6, -12]]) {
      const side = Math.sign(x);
      this.prop([
        box(0.12, 4.2, 0.12, 0x2a2a30, 0, 2.1, 0),
        box(0.9, 0.08, 0.08, 0x2a2a30, -side * 0.4, 4.15, 0),
        block(0.4, 0.14, 0.24, 0x2a2a30, -side * 0.8, 4.08, 0, 0.04),
      ], x, 0, z);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.18), new THREE.MeshBasicMaterial({ color: glow(0xffd9a0, 3) }));
      bulb.position.set(x - side * 0.8, 4.0, z);
      this.add(bulb);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 4, 24, 1, true).translate(0, -2, 0),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      cone.position.set(x - side * 0.8, 4.0, z);
      this.add(cone);
      this.blockOut(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    }
  }

  buildDjTable() {
    const z = -11.5;
    this.prop([
      block(2.4, 1.0, 0.9, 0x1d1b26, 0, 0.5, 0, 0.05),
      block(0.6, 0.06, 0.45, 0x55556a, -0.55, 1.03, 0, 0.02),
      block(0.6, 0.06, 0.45, 0x55556a, 0.55, 1.03, 0, 0.02),
      block(0.4, 0.08, 0.35, 0x2b2b33, 0, 1.04, 0, 0.02),
      // speaker towers
      block(0.8, 1.7, 0.7, 0x16141e, -2, 0.85, 0, 0.06), block(0.8, 1.7, 0.7, 0x16141e, 2, 0.85, 0, 0.06),
      // truss
      box(0.1, 3.4, 0.1, 0x777788, -2.6, 1.7, -0.3), box(0.1, 3.4, 0.1, 0x777788, 2.6, 1.7, -0.3), box(5.3, 0.1, 0.1, 0x777788, 0, 3.4, -0.3),
    ], 0, 0, z);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3cac }));
    strip.position.set(0, 0.8, z + 0.46);
    this.add(strip);
    this.addSpeakerCones([[-2, 1.25, z + 0.36, 0.22], [-2, 0.55, z + 0.36, 0.28], [2, 1.25, z + 0.36, 0.22], [2, 0.55, z + 0.36, 0.28]]);
    const truss = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: glow(NEON[i % NEON.length], 2.5) }));
      l.position.set(-2.2 + i * 0.88, 3.25, z - 0.3);
      this.add(l);
      truss.push(l);
    }
    this.updaters.push((dt, beat, pulse) => {
      strip.material.color.setHSL((beat / 8) % 1, 1, 0.5).multiplyScalar(1 + 2 * pulse);
      truss.forEach((l, i) => l.material.color.copy(glow(NEON[(i + Math.floor(beat)) % NEON.length], 1 + 3 * pulse)));
    });
    this.blockOut(-2.6, 2.6, z - 0.8, z + 0.7);
    this.addDj(0, 0, z - 0.8);
  }

  addDj(x, y, z) {
    const dj = new Guest(this.crowdGroup, { partyHatChance: 0 });
    dj.root.position.set(x, y, z);
    dj.style = 0;
    this.guests.push(dj);
  }

  addSpeakerCones(list) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.35, metalness: 0.3 });
    const cones = list.map(([x, y, z, r]) => {
      const c = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat);
      c.position.set(x, y, z);
      this.add(c);
      return c;
    });
    this.updaters.push((dt, beat, pulse) => cones.forEach((c) => c.scale.setScalar(1 + 0.1 * pulse)));
  }

  // ----- rave / festival props -----

  buildStage(text, huge) {
    const w = huge ? 10 : 8;
    this.prop([
      block(w, 0.9, 3.2, 0x15121f, 0, 0.45, 0, 0.05),
      block(2.0, 1.0, 0.8, 0x1d1b26, 0, 1.4, 0.6, 0.05),
      block(1.8, 0.06, 0.55, 0x777788, 0, 1.93, 0.6, 0.02),
      block(1.2, 2.4, 1.0, 0x16141e, -w / 2 + 0.6, 2.1, 0, 0.08),
      block(1.2, 2.4, 1.0, 0x16141e, w / 2 - 0.6, 2.1, 0, 0.08),
      box(0.15, 5.6, 0.15, 0x777788, -w / 2 - 0.2, 2.8, -1.4), box(0.15, 5.6, 0.15, 0x777788, w / 2 + 0.2, 2.8, -1.4),
      box(w + 0.6, 0.15, 0.15, 0x777788, 0, 5.6, -1.4),
    ], 0, 0, STAGE_Z);
    this.addSpeakerCones([
      [-w / 2 + 0.6, 2.75, STAGE_Z + 0.51, 0.32], [-w / 2 + 0.6, 1.65, STAGE_Z + 0.51, 0.42],
      [w / 2 - 0.6, 2.75, STAGE_Z + 0.51, 0.32], [w / 2 - 0.6, 1.65, STAGE_Z + 0.51, 0.42],
    ]);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3cac }));
    edge.position.set(0, 0.86, STAGE_Z + 1.62);
    this.add(edge);

    // LED wall
    const tex = canvasTex(1024, 384, (g, cw, ch) => {
      g.fillStyle = '#0d0818';
      g.fillRect(0, 0, cw, ch);
      const grad = g.createLinearGradient(0, 0, cw, 0);
      grad.addColorStop(0, '#ff3cac');
      grad.addColorStop(0.5, '#ffd23f');
      grad.addColorStop(1, '#2bd2ff');
      g.fillStyle = grad;
      g.font = 'bold 190px Bungee, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cw / 2, ch / 2 + 10);
      // LED pixel grid
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < cw; x += 8) g.fillRect(x, 0, 2, ch);
      for (let y = 0; y < ch; y += 8) g.fillRect(0, y, cw, 2);
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, w * 0.31), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(0, 3.7, STAGE_Z - 1.3);
    this.add(screen);

    // Truss lights
    const lamps = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      l.position.set(-w / 2 + 0.5 + (i * (w - 1)) / 7, 5.4, STAGE_Z - 1.2);
      this.add(l);
      lamps.push(l);
    }
    this.updaters.push((dt, beat, pulse) => {
      const hue = (beat / 16) % 1;
      screen.material.color.setHSL(hue, 0.35, 0.6).multiplyScalar(0.75 + 0.45 * pulse);
      edge.material.color.setHSL((hue + 0.5) % 1, 1, 0.5).multiplyScalar(1 + 2 * pulse);
      lamps.forEach((l, i) => l.material.color.copy(glow(NEON[(i + Math.floor(beat / 2)) % NEON.length], 1 + 3 * (i % 2 === Math.floor(beat) % 2 ? pulse : 0.2))));
    });
    this.blockOut(-w / 2 - 0.4, w / 2 + 0.4, STAGE_Z - 2, STAGE_Z + 1.8);
    this.addDj(0, 0.9, STAGE_Z + 0.05);
  }

  buildDanceFloor() {
    const tex = canvasTex(256, 256, (g) => {
      const colors = ['#ff3cac', '#2bd2ff', '#ffd23f', '#9b5cff'];
      g.fillStyle = '#111';
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = colors[(x + y * 3) % 4];
          g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
        }
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x555555 });
    const df = new THREE.Mesh(new THREE.PlaneGeometry(12, 8).rotateX(-Math.PI / 2), mat);
    df.position.set(0, 0.003, STAGE_Z + 5.8);
    this.add(df);
    this.updaters.push((dt, beat, pulse) => mat.color.setScalar(0.35 + 1.1 * pulse));
  }

  buildBeams(n) {
    const geo = new THREE.CylinderGeometry(0.05, 1.0, 16, 20, 1, true).translate(0, 8, 0);
    const beams = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: NEON[i % NEON.length], transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.position.set(-4 + (i * 8) / Math.max(1, n - 1), 0.9, STAGE_Z + 1.2);
      this.add(m);
      return m;
    });
    this.updaters.push(() => beams.forEach((b, i) => {
      b.rotation.z = Math.sin(this.time * 0.8 + i * 1.3) * 0.6;
      b.rotation.x = -0.25 + Math.cos(this.time * 0.6 + i) * 0.25;
    }));
  }

  buildLasers(n) {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 30, 6, 1, true).translate(0, 15, 0);
    const lasers = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: glow([0x7cff6a, 0xff3cac, 0x2bd2ff][i % 3], 4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(-3 + (i * 6) / Math.max(1, n - 1), 5.4, STAGE_Z - 1);
      this.add(m);
      return m;
    });
    this.updaters.push((dt, beat) => lasers.forEach((l, i) => {
      // Lasers fan out over the crowd, sweeping on the beat
      l.rotation.x = 1.2 + Math.sin(beat * 0.5 + i) * 0.25;
      l.rotation.z = Math.sin(this.time * 1.1 + i * 0.9) * 0.7;
      l.visible = Math.floor(beat * 2 + i) % 4 !== 0;
    }));
  }

  buildFireworks() {
    const N = 90;
    const pool = Array.from({ length: 6 }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.45, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      pts.visible = false;
      this.add(pts);
      return { pts, vel: new Float32Array(N * 3), t: 0, origin: new THREE.Vector3() };
    });
    let next = 0.5;
    this.updaters.push((dt) => {
      next -= dt;
      if (next <= 0) {
        next = rand(0.6, 1.4);
        const fw = pool.find((p) => !p.pts.visible);
        if (fw) {
          fw.t = 0;
          fw.origin.set(rand(-14, 14), rand(10, 16), rand(-26, -18));
          fw.pts.material.color.copy(glow(pick(NEON), 3));
          for (let i = 0; i < N; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(3, 5));
            fw.vel.set([v.x, v.y, v.z], i * 3);
          }
          fw.pts.visible = true;
        }
      }
      for (const fw of pool) {
        if (!fw.pts.visible) continue;
        fw.t += dt;
        const t = fw.t;
        const pos = fw.pts.geometry.attributes.position;
        for (let i = 0; i < N; i++) {
          pos.setXYZ(i,
            fw.origin.x + fw.vel[i * 3] * t,
            fw.origin.y + fw.vel[i * 3 + 1] * t - 2.5 * t * t,
            fw.origin.z + fw.vel[i * 3 + 2] * t);
        }
        pos.needsUpdate = true;
        fw.pts.material.opacity = Math.max(0, 1 - t / 1.6);
        if (t > 1.6) fw.pts.visible = false;
      }
    });
  }

  // ----- shared: string lights, colored lights, confetti -----

  buildStrands(count) {
    if (!count) return;
    const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const warm = this.level.energy <= 1;
    const palette = (warm ? [0xffd9a0, 0xffc070, 0xfff0c8] : NEON).map((c) => glow(c, 2.6));
    const poles = [];
    for (let s = 0; s < count; s++) {
      const z = -3.6 - (s * 9) / Math.max(1, count);
      const n = 34;
      const strand = new THREE.InstancedMesh(bulbGeo, bulbMat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        m.setPosition(-7.5 + t * 15, 3.7 - Math.sin(t * Math.PI) * 0.9, z + Math.sin(t * Math.PI) * 0.3);
        strand.setMatrixAt(i, m);
        strand.setColorAt(i, palette[i % palette.length]);
      }
      this.add(strand);
      poles.push(box(0.1, 3.8, 0.1, 0x2a2433, -7.5, 1.9, z), box(0.1, 3.8, 0.1, 0x2a2433, 7.5, 1.9, z));
    }
    this.prop(poles);
  }

  buildLights(level) {
    const e = level.energy;
    const colors = e <= 0 ? [0xffb070] : e === 1 ? [0xff7ab8, 0xffc070] : [0xff3cac, 0x2bd2ff, 0xffd23f];
    this.lights = colors.map((color, i) => {
      const l = new THREE.PointLight(color, 4, 18, 1);
      l.position.set(-4 + i * 4, 4, -8);
      this.add(l);
      return l;
    });
    this.lightPulse = [0.1, 0.3, 0.6, 1, 1][e];
  }

  buildConfetti(ambient) {
    const BURST = 140;
    const n = ambient + BURST;
    this.ambientConfetti = ambient;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.confettiVel = new Float32Array(n);
    const palette = NEON.concat(0xffffff).map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const ambientP = i < ambient;
      pos.set([rand(-8, 8), ambientP ? rand(0, 8) : -20, rand(-15, -1.5)], i * 3);
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
      this.confettiVel[i] = rand(0.4, 0.9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
    this.add(this.confetti);
  }

  buildCrowd(level) {
    const spots = [];
    const minGap = level.guests > 60 ? 0.62 : 0.75;
    const zMax = level.props.stage ? STAGE_Z + 2.2 : level.props.djTable ? -14 : -12;
    const inAvoid = (x, z) => this.avoid.some(([x0, x1, z0, z1]) => x > x0 - 0.35 && x < x1 + 0.35 && z > z0 - 0.35 && z < z1 + 0.35);
    const tryAdd = (x, z) => {
      if (inAvoid(x, z) || spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < minGap)) return;
      spots.push([x, z]);
    };
    const nearWindow = Math.round(level.guests * 0.12);
    for (let i = 0; i < 2000 && spots.length < level.guests - nearWindow; i++) tryAdd(rand(-7, 7), rand(zMax, -4.4));
    for (let i = 0; i < 400 && spots.length < level.guests; i++) {
      tryAdd(Math.random() < 0.5 ? rand(-3.4, -0.7) : rand(2.6, 4.6), rand(-4.2, -2.6));
    }

    const styles = STYLES[level.energy];
    const focus = level.props.stage ? new THREE.Vector3(0, 0, STAGE_Z) : level.props.djTable ? new THREE.Vector3(0, 0, -11.5) : null;
    for (const [x, z] of spots) {
      const g = new Guest(this.crowdGroup, { partyHatChance: level.partyHats ?? 0.15 });
      g.root.position.set(x, 0, z);
      g.style = pick(styles);
      if (focus && Math.random() < 0.75) g.root.rotation.y = Math.atan2(focus.x - x, focus.z - z) + rand(-0.3, 0.3);
      else g.root.rotation.y = rand(-Math.PI, Math.PI);
      this.guests.push(g);
    }
  }

  // ---------- the line of hungry guests ----------

  startQueue(orders) {
    for (const g of this.queue) this.removeGuest(g);
    this.pending = [...orders];
    this.queue = [];
    this.names = [...NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < QUEUE_SPOTS.length && this.pending.length; i++) this.spawnCustomer(i);
  }

  spawnCustomer(slot) {
    const order = this.pending.shift();
    const g = new Guest(this.crowdGroup, { partyHatChance: this.level.partyHats ?? 0.15 });
    const spot = QUEUE_SPOTS[slot];
    g.root.position.set(spot.x + rand(-1, 1), 0, spot.z - rand(1.5, 3));
    g.order = order;
    g.name = this.names.pop() || 'Guest';
    g.showBubble(order.items.map((t) => ITEM_EMOJI[t]).join(''));
    this.queue.push(g);
    this.guests.push(g);
    this.placeInLine(g, this.queue.length - 1);
  }

  placeInLine(g, i) {
    g.walkTo(QUEUE_SPOTS[i], 'wait', 0);
    g.setBubbleSlot(i === 0);
  }

  get front() {
    return this.queue[0];
  }

  frontReady() {
    return this.front?.arrived ?? Promise.resolve();
  }

  setFrontMood(frac) {
    this.front?.setMood(frac > 0.6 ? 'happy' : frac > 0.3 ? 'ok' : 'angry');
  }

  serveFront(happy) {
    const g = this.queue.shift();
    if (!g) return;
    g.showBubble(happy ? '😍' : '😑', happy ? 'love' : 'ok');
    g.setMood(happy ? 'love' : 'meh');
    g.shout(1.2);
    this.burst(g.root.position);
    setTimeout(() => g.hideBubble(), 1400);
    g.walkTo(new THREE.Vector3(rand(-5, 5), 0, rand(-11, -5)), 'hold', Math.PI + rand(-0.5, 0.5));
    this.holders.push(g);
    if (this.holders.length > MAX_HOLDERS) this.removeGuest(this.holders.shift());
    this.queue.forEach((q, i) => this.placeInLine(q, i));
    if (this.pending.length) this.spawnCustomer(this.queue.length);
  }

  removeGuest(g) {
    g.dispose();
    this.guests = this.guests.filter((x) => x !== g);
  }

  burst(at) {
    const pos = this.confetti.geometry.attributes.position;
    for (let i = this.ambientConfetti; i < pos.count; i++) {
      pos.setXYZ(i, at.x + rand(-0.9, 0.9), rand(2.3, 3.6), at.z + rand(-0.9, 0.4));
    }
    pos.needsUpdate = true;
  }

  update(dt, beat) {
    if (!this.level) return;
    this.time += dt;
    const front = this.queue[0];
    for (const g of this.guests) g.update(dt, beat, g === front && g.mode === 'wait');

    const pulse = Math.pow(1 - (beat % 1), 2);
    const lp = this.lightPulse;
    this.lights.forEach((l, i) => {
      l.intensity = 3 + 6 * lp * pulse;
      if (this.level.energy >= 2) {
        l.position.x = Math.sin(this.time * 0.5 + i * 2.1) * 5;
        l.position.z = -8 + Math.cos(this.time * 0.4 + i) * 3;
      }
    });
    for (const u of this.updaters) u(dt, beat, pulse * lp + (1 - lp) * 0.3);

    // Confetti drifts down; ambient pieces loop back to the top, burst pieces fall away
    const pos = this.confetti.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      if (y < -10) continue;
      y -= this.confettiVel[i] * dt;
      if (y < 0) y = i < this.ambientConfetti ? y + 8 : -20;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(this.time * 2 + i) * dt * 0.15);
    }
    pos.needsUpdate = true;
  }
}
