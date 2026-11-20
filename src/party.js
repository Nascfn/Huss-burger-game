// The party outside the window: crowd, stage, lights, confetti, and the line of hungry guests.
import * as THREE from 'three';
import { WALL_Z } from './scene.js';
import { makePerson, poseDance, poseWalk, poseWait, poseHold, HOLD_POINT } from './people.js';
import { tween, ease } from './tween.js';

const NAMES = ['Jess', 'Big Mike', 'DJ Kev', 'Tasha', 'Rico', 'Lulu', 'Marco', 'Priya', 'Dante', 'Zoe', 'Gus', 'Nia', 'Theo', 'Kiki', 'Omar', 'Bea', 'Sal', 'Ivy'];
const ITEM_EMOJI = { burger: '🍔', fries: '🍟', drink: '🥤' };
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

export const SERVE_X = 1.05; // the window spot lines up with the bag station
const QUEUE_SPOTS = [
  new THREE.Vector3(SERVE_X, 0, WALL_Z - 0.33),
  new THREE.Vector3(0.55, 0, -1.8),
  new THREE.Vector3(1.5, 0, -2.25),
  new THREE.Vector3(0.8, 0, -2.85),
  new THREE.Vector3(1.35, 0, -3.4),
];
const STAGE_Z = -15.5;
const MAX_HOLDERS = 16; // served guests that stick around with their bags

const rand = (a, b) => a + Math.random() * (b - a);

// ---------- speech bubble ----------

function makeBubble() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 150;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false }));
  sprite.position.y = 2.12;
  sprite.scale.set(0.5, 0.234, 1);
  return { sprite, canvas, tex };
}

const MOOD_COLORS = { idle: '#2b1d16', happy: '#5fd068', ok: '#ffc23d', angry: '#d9412b', love: '#ff5fa2' };

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
  constructor(parent) {
    this.p = makePerson();
    parent.add(this.p.root);
    this.mode = 'dance';
    this.style = Math.floor(Math.random() * 3);
    this.phase = Math.random();
    this.t = Math.random() * 10;
    this.speed = rand(1.6, 2.0);
    this.target = null;
    this.bubble = null;
    this.order = null;
    this.name = '';
  }

  get root() {
    return this.p.root;
  }

  /** Walk to a point, then switch to `then` mode facing `faceY`. Resolves on arrival. */
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
    if (this.bubble && mood !== this.mood) this.showBubble(this.bubbleText, mood);
  }

  hideBubble() {
    if (this.bubble) {
      this.root.remove(this.bubble.sprite);
      this.bubble.tex.dispose();
      this.bubble.sprite.material.dispose();
      this.bubble = null;
    }
  }

  /** Bubble pops bigger for a moment (they're shouting their order). */
  shout(big = 1) {
    if (!this.bubble) return;
    const s = this.bubble.sprite;
    const base = s.scale.x / 0.5;
    tween(0.35, (k) => {
      const m = base * big * (1 + Math.sin(k * Math.PI) * 0.25);
      s.scale.set(0.5 * m, 0.234 * m, 1);
    }, ease.outCubic);
  }

  /** The guest at the window gets a bigger bubble beside their head so the window frame doesn't cut it off. */
  setBubbleSlot(atWindow) {
    if (!this.bubble) return;
    const m = atWindow ? 1.1 : 0.85;
    this.bubble.sprite.scale.set(0.5 * m, 0.234 * m, 1);
    if (atWindow) this.bubble.sprite.position.set(0.42, 1.78, 0);
    else this.bubble.sprite.position.set(0, 2.12, 0);
  }

  handWorld() {
    return this.root.localToWorld(HOLD_POINT.clone());
  }

  hold(obj) {
    this.root.attach(obj);
    this.held = obj;
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
        pos.set(this.target.x, 0, this.target.z);
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
}

// ---------- the whole party ----------

export class Party {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.guests = [];
    this.queue = [];
    this.pending = [];
    this.holders = [];
    this.time = 0;
    this.buildGround();
    this.buildStage();
    this.buildLights();
    this.buildConfetti();
    this.buildStars();
    this.buildCrowd();
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 50),
      new THREE.MeshStandardMaterial({ color: 0x1d1a2e, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.001, WALL_Z - 25);
    this.group.add(ground);

    // Dance floor in front of the stage
    const floorTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const colors = ['#ff3cac', '#2bd2ff', '#ffd23f', '#9b5cff'];
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          g.fillStyle = colors[(x + y * 3) % 4];
          g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
        }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.danceFloorMat = new THREE.MeshBasicMaterial({ map: floorTex, color: 0x555555 });
    const df = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), this.danceFloorMat);
    df.rotation.x = -Math.PI / 2;
    df.position.set(0, 0.002, STAGE_Z + 5.2);
    this.group.add(df);
  }

  buildStage() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.6 });
    const add = (geo, m, x, y, z) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(8, 0.9, 3), dark, 0, 0.45, STAGE_Z);
    this.stageStrip = new THREE.MeshBasicMaterial({ color: 0xff3cac });
    add(new THREE.BoxGeometry(8, 0.08, 0.05), this.stageStrip, 0, 0.86, STAGE_Z + 1.52);
    add(new THREE.BoxGeometry(1.8, 1.0, 0.7), dark, 0, 1.4, STAGE_Z + 0.5);
    add(new THREE.BoxGeometry(1.7, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0x777788, metalness: 0.6 }), 0, 1.92, STAGE_Z + 0.5);

    // Speakers
    const cone = new THREE.MeshStandardMaterial({ color: 0x3a3a48, roughness: 0.4 });
    for (const sx of [-3.3, 3.3]) {
      add(new THREE.BoxGeometry(1.1, 2.2, 0.9), dark, sx, 2.0, STAGE_Z);
      for (const [cy, r] of [[2.55, 0.28], [1.6, 0.4]]) {
        const c = add(new THREE.CircleGeometry(r, 24), cone, sx, cy, STAGE_Z + 0.46);
        c.userData.baseR = 1;
        (this.speakerCones ||= []).push(c);
      }
    }

    // LED screen
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#ff3cac');
    grad.addColorStop(0.5, '#ffd23f');
    grad.addColorStop(1, '#2bd2ff');
    g.fillStyle = '#120b20';
    g.fillRect(0, 0, 512, 192);
    g.fillStyle = grad;
    g.font = 'bold 96px Bungee, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HUSS FEST', 256, 100);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: tex });
    add(new THREE.PlaneGeometry(6.4, 2.4), this.screenMat, 0, 3.6, STAGE_Z - 1.3);

    // DJ
    this.dj = new Guest(this.group);
    this.dj.root.position.set(0, 0.9, STAGE_Z - 0.1);
    this.dj.style = 0;
    this.guests.push(this.dj);

    // Light beams sweeping the sky
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.9, 14, 16, 1, true).translate(0, 7, 0);
    this.beams = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a].map((color, i) => {
      const m = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      m.position.set(-3 + i * 2, 0.9, STAGE_Z + 0.8);
      this.group.add(m);
      return m;
    });
  }

  buildLights() {
    this.partyLights = [0xff3cac, 0x2bd2ff, 0xffd23f].map((color, i) => {
      const l = new THREE.PointLight(color, 6, 16, 1);
      l.position.set(-4 + i * 4, 4, -8);
      this.group.add(l);
      return l;
    });

    // String lights: a few strands across the party
    const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const palette = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0xff7a3d].map((c) => new THREE.Color(c));
    for (const z of [-3.5, -7, -10.5]) {
      const n = 30;
      const strand = new THREE.InstancedMesh(bulbGeo, bulbMat, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = -7 + t * 14;
        const y = 3.6 - Math.sin(t * Math.PI) * 0.9;
        m.setPosition(x, y, z + Math.sin(t * Math.PI) * 0.3);
        strand.setMatrixAt(i, m);
        strand.setColorAt(i, palette[i % palette.length]);
      }
      this.group.add(strand);
    }
    // Poles holding the strands
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2433 });
    for (const z of [-3.5, -7, -10.5])
      for (const x of [-7, 7]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.7), poleMat);
        pole.position.set(x, 1.85, z);
        this.group.add(pole);
      }
  }

  buildConfetti() {
    const n = 600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.confettiVel = new Float32Array(n);
    const palette = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0xffffff].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-7, 7);
      pos[i * 3 + 1] = rand(0, 7);
      pos[i * 3 + 2] = rand(-14, -1.5);
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
      this.confettiVel[i] = rand(0.4, 0.9);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true }));
    this.group.add(this.confetti);
  }

  buildStars() {
    const n = 400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(0.12, 1.3);
      const r = 45;
      pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r - 15], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.group.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, color: 0xffffff, fog: false })));
  }

  buildCrowd() {
    const spots = [];
    const tryAdd = (x, z) => {
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.65)) return;
      spots.push([x, z]);
    };
    // Main crowd between the window and the stage
    for (let i = 0; i < 400 && spots.length < 58; i++) tryAdd(rand(-6.5, 6.5), rand(-13.5, -4.3));
    // A few hanging out near the window, away from the line
    for (let i = 0; i < 60 && spots.length < 64; i++) tryAdd(rand(-3.2, -0.6), rand(-4, -2.6));
    for (let i = 0; i < 60 && spots.length < 68; i++) tryAdd(rand(2.6, 4.5), rand(-4, -2.6));

    for (const [x, z] of spots) {
      const g = new Guest(this.group);
      g.root.position.set(x, 0, z);
      // Most face the stage; some face their friends
      g.root.rotation.y = Math.random() < 0.7 ? Math.PI + rand(-0.4, 0.4) : rand(-Math.PI, Math.PI);
      this.guests.push(g);
    }
  }

  // ---------- the line of hungry guests ----------

  /** Start a shift: the first guests walk up to the window with their orders. */
  startQueue(orders) {
    this.pending = [...orders];
    this.queue = [];
    this.names = [...NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < QUEUE_SPOTS.length && this.pending.length; i++) this.spawnCustomer(i);
  }

  spawnCustomer(slot) {
    const order = this.pending.shift();
    const g = new Guest(this.group);
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

  /** Resolves when the guest at the front has reached the window. */
  frontReady() {
    return this.front?.arrived ?? Promise.resolve();
  }

  setFrontMood(frac) {
    const f = this.front;
    if (!f) return;
    f.setMood(frac > 0.6 ? 'happy' : frac > 0.3 ? 'ok' : 'angry');
  }

  /** The front guest got their bag: they cheer, walk back into the party, and the line moves up. */
  serveFront(happy) {
    const g = this.queue.shift();
    if (!g) return;
    g.showBubble(happy ? '😍' : '🙂', happy ? 'love' : 'ok');
    g.shout(1.2);
    this.burst(g.root.position);
    setTimeout(() => g.hideBubble(), 1400);
    const dest = new THREE.Vector3(rand(-5, 5), 0, rand(-12, -5));
    g.walkTo(dest, 'hold', Math.PI + rand(-0.5, 0.5));
    this.holders.push(g);
    if (this.holders.length > MAX_HOLDERS) this.removeGuest(this.holders.shift());

    this.queue.forEach((q, i) => this.placeInLine(q, i));
    if (this.pending.length) this.spawnCustomer(this.queue.length);
  }

  removeGuest(g) {
    g.root.removeFromParent();
    this.guests = this.guests.filter((x) => x !== g);
  }

  /** Throw a cloud of confetti above a spot. */
  burst(at) {
    const pos = this.confetti.geometry.attributes.position;
    for (let k = 0; k < 80; k++) {
      const i = Math.floor(Math.random() * pos.count);
      pos.setXYZ(i, at.x + rand(-0.8, 0.8), rand(2.4, 3.4), at.z + rand(-0.8, 0.5));
    }
    pos.needsUpdate = true;
  }

  update(dt, beat) {
    this.time += dt;
    const frontGuest = this.queue[0];
    for (const g of this.guests) g.update(dt, beat, g === frontGuest && g.mode === 'wait');

    // Lights pulse on the beat
    const pulse = Math.pow(1 - (beat % 1), 2);
    this.partyLights.forEach((l, i) => {
      l.intensity = 3 + 6 * pulse;
      l.position.x = Math.sin(this.time * 0.5 + i * 2.1) * 5;
      l.position.z = -8 + Math.cos(this.time * 0.4 + i) * 3;
    });
    this.beams.forEach((b, i) => {
      b.rotation.z = Math.sin(this.time * 0.8 + i * 1.3) * 0.6;
      b.rotation.x = -0.25 + Math.cos(this.time * 0.6 + i) * 0.25;
    });
    const hue = (beat / 16) % 1;
    this.screenMat.color.setHSL(hue, 0.6, 0.55 + 0.45 * pulse);
    this.stageStrip.color.setHSL((hue + 0.5) % 1, 1, 0.5);
    this.danceFloorMat.color.setScalar(0.35 + 0.65 * pulse);
    for (const c of this.speakerCones) c.scale.setScalar(1 + 0.08 * pulse);

    // Confetti drifts down and loops
    const pos = this.confetti.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - this.confettiVel[i] * dt;
      if (y < 0) y += 7;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(this.time * 2 + i) * dt * 0.15);
    }
    pos.needsUpdate = true;
  }
}
