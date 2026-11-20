// The four work stations. Each one turns 3 correct key presses into 3 visible steps.
import * as THREE from 'three';
import { COUNTER_Y, STATION_Z, std, shadowify } from './scene.js';
import { tween, cancelTweens, ease, wait } from './tween.js';

export const STATION_X = { drink: -0.55, burger: 0, fries: 0.55, bag: 1.05 };

// ---------- shared textures / materials ----------

function textTexture(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const paperTex = textTexture((g, s) => {
  g.fillStyle = '#f6ecd6';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#d9412b';
  g.lineWidth = 10;
  g.strokeRect(10, 10, s - 20, s - 20);
  g.fillStyle = 'rgba(217,65,43,0.55)';
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.save();
  g.translate(s / 2, s / 2);
  g.rotate(-Math.PI / 4);
  for (let i = -2; i <= 2; i++) g.fillText('HUSS', 0, i * 48 + 12);
  g.restore();
});

const stickerTex = textTexture((g, s) => {
  g.fillStyle = '#d9412b';
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff4d6';
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HHH', s / 2, s / 2 + 4);
});

// Fry carton print: red with a yellow smile on each of the 4 faces.
const cartonTex = textTexture((g, s) => {
  g.fillStyle = '#d9412b';
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 4; i++) {
    const cx = (i + 0.5) * (s / 4);
    g.strokeStyle = '#ffc23d';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(cx, s * 0.42, 20, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.fillStyle = '#ffc23d';
    g.fillRect(i * (s / 4), s - 26, s / 4, 10);
  }
});

const MAT = {
  cartonPrint: std(0xffffff, { map: cartonTex, side: THREE.DoubleSide, roughness: 0.5 }),
  paper: std(0xffffff, { map: paperTex, side: THREE.DoubleSide, roughness: 0.85 }),
  bun: std(0xd99a4e, { roughness: 0.6 }),
  patty: std(0x4a2a17, { roughness: 0.9 }),
  cheese: std(0xffc21a, { roughness: 0.4 }),
  lettuce: std(0x5fb53a),
  seed: std(0xfff3d6),
  fry: std(0xf2c14e, { roughness: 0.5 }),
  carton: std(0xd9412b, { side: THREE.DoubleSide, roughness: 0.5 }),
  cup: std(0xfaf7f0, { side: THREE.DoubleSide, roughness: 0.4 }),
  cupBand: std(0xd9412b, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }),
  cola: std(0x3a170a, { roughness: 0.15 }),
  lid: std(0xe8e8e8, { roughness: 0.3, transparent: true, opacity: 0.92 }),
  straw: std(0xffe14d),
  kraft: std(0xb98a5a, { side: THREE.DoubleSide, roughness: 0.9 }),
  sticker: new THREE.MeshStandardMaterial({ map: stickerTex, transparent: true, roughness: 0.5 }),
  steel: std(0xb8bcc2, { metalness: 0.45, roughness: 0.5 }),
  dark: std(0x2a2522, { roughness: 0.6 }),
  red: std(0xc23b26, { roughness: 0.5 }),
};

const flatPlane = (w, d, mat) => {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, mat);
};

// ---------- base station ----------

class Station {
  constructor(scene, x) {
    this.scene = scene;
    this.x = x;
    this.group = new THREE.Group();
    this.group.position.set(x, COUNTER_Y, STATION_Z);
    scene.add(this.group);
    this.item = null;
  }

  setItem(item) {
    this.item = shadowify(item);
    this.group.add(item);
  }

  /** Small squash on every correct press. */
  punch() {
    const it = this.item;
    return tween(0.16, (k) => {
      const p = Math.sin(k * Math.PI) * 0.06;
      it.scale.set(1 + p, 1 - p, 1 + p);
    }, ease.linear, this);
  }

  /** Bigger squash when all 3 presses are done. */
  complete() {
    const it = this.item;
    return tween(0.3, (k) => {
      const p = Math.sin(k * Math.PI);
      it.scale.set(1 + p * 0.1, 1 - p * 0.18, 1 + p * 0.1);
    }, ease.outCubic, this);
  }

  /** Hand the finished item over (to fly to the bag) and pop a fresh one in. */
  detachItem() {
    cancelTweens(this);
    const old = this.item;
    old.scale.set(1, 1, 1);
    this.scene.attach(old);
    this.buildItem();
    const it = this.item;
    it.scale.setScalar(0.001);
    tween(0.3, (k) => it.scale.setScalar(Math.max(k, 0.001)), ease.outBack, this, 0.35);
    return old;
  }

  stopAnims() {
    cancelTweens(this);
    if (this.item) this.item.scale.set(1, 1, 1);
  }
}

// ---------- burger: fold left (A), fold right (D), fold back (W) ----------

const BURGER_H = 0.096;

function makeBurger() {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.07, 0.024, 32), MAT.bun);
  bottom.position.y = 0.013;
  const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.079, 0.02, 32), MAT.patty);
  patty.position.y = 0.035;
  const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.004, 0.13), MAT.cheese);
  cheese.position.y = 0.047;
  cheese.rotation.y = Math.PI / 4;
  const lettuce = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.006, 12), MAT.lettuce);
  lettuce.position.y = 0.052;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.bun);
  top.scale.y = 0.52;
  top.position.y = 0.055;
  g.add(bottom, patty, cheese, lettuce, top);

  const seedGeo = new THREE.SphereGeometry(0.004, 6, 4);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.055;
    const s = new THREE.Mesh(seedGeo, MAT.seed);
    const y = 0.055 + 0.52 * Math.sqrt(0.075 * 0.075 - r * r);
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    s.scale.set(1, 0.5, 1.6);
    s.rotation.y = Math.random() * Math.PI;
    g.add(s);
  }
  return g;
}

function makeFlap(parent, { w, d, hinge, offset, axis, angle, lift }) {
  const pivot = new THREE.Group();
  pivot.position.set(...hinge);
  const mesh = flatPlane(w, d, MAT.paper);
  mesh.position.set(offset[0], 0.0015, offset[2]);
  pivot.add(mesh);
  parent.add(pivot);
  return { pivot, axis, angle, lift, k: 0 };
}

function setFlap(f, k) {
  f.k = k;
  f.pivot.rotation[f.axis] = f.angle * k;
  f.pivot.position.y = f.lift * k * k;
}

export class BurgerStation extends Station {
  constructor(scene) {
    super(scene, STATION_X.burger);
    this.buildDecor();
    this.buildItem();
  }

  buildDecor() {
    // Warm heat-lamp glow on the wrapping spot (no lamp mesh, so it doesn't block the window)
    const glow = new THREE.PointLight(0xff9a40, 0.12, 1.2);
    glow.position.set(0, 0.55, -0.05);
    this.group.add(glow);
  }

  buildItem() {
    const item = new THREE.Group();
    const base = flatPlane(0.3, 0.3, MAT.paper);
    base.position.y = 0.001;
    item.add(base, makeBurger());
    this.flaps = [
      makeFlap(item, { w: 0.15, d: 0.3, hinge: [-0.15, 0, 0], offset: [-0.075, 0, 0], axis: 'z', angle: -Math.PI, lift: BURGER_H + 0.003 }),
      makeFlap(item, { w: 0.15, d: 0.3, hinge: [0.15, 0, 0], offset: [0.075, 0, 0], axis: 'z', angle: Math.PI, lift: BURGER_H + 0.006 }),
      makeFlap(item, { w: 0.3, d: 0.15, hinge: [0, 0, -0.15], offset: [0, 0, -0.075], axis: 'x', angle: Math.PI, lift: BURGER_H + 0.009 }),
    ];
    this.setItem(item);
  }

  advance(i) {
    this.punch();
    const f = this.flaps[i];
    const from = f.k;
    return tween(0.2, (k) => setFlap(f, from + (1 - from) * k), ease.outCubic, this);
  }

  rewind() {
    this.stopAnims();
    for (const f of this.flaps) {
      const from = f.k;
      tween(0.25, (k) => setFlap(f, from * (1 - k)), ease.outCubic, this);
    }
  }
}

// ---------- fries: three scoops (S, W, D) ----------

const fryGeo = new THREE.BoxGeometry(0.009, 0.085, 0.009);

export class FriesStation extends Station {
  constructor(scene) {
    super(scene, STATION_X.fries);
    this.buildDecor();
    this.buildItem();
  }

  buildDecor() {
    // Fryer behind
    const fryer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), MAT.steel);
    fryer.position.set(0.02, 0.11, -0.4);
    const oil = flatPlane(0.36, 0.24, std(0x8a5a12, { roughness: 0.45, metalness: 0 }));
    oil.position.set(0.02, 0.221, -0.4);
    // Warming tray with a pile of fries on the left
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.2), MAT.steel);
    tray.position.set(-0.17, 0.01, -0.02);
    const pile = new THREE.Group();
    for (let i = 0; i < 40; i++) {
      const f = new THREE.Mesh(fryGeo, MAT.fry);
      f.position.set(-0.17 + (Math.random() - 0.5) * 0.12, 0.025 + Math.random() * 0.02, -0.02 + (Math.random() - 0.5) * 0.16);
      f.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, Math.random() * Math.PI);
      pile.add(f);
    }
    this.group.add(shadowify(fryer), oil, shadowify(tray), shadowify(pile));
  }

  buildItem() {
    const item = new THREE.Group();
    // Tapered carton: ~±3.5cm wide at the bottom, ~±5.3cm at the top (x); about half that front-to-back.
    const geo = new THREE.CylinderGeometry(0.075, 0.05, 0.13, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const carton = new THREE.Mesh(geo, MAT.cartonPrint);
    carton.scale.z = 0.55;
    carton.position.y = 0.065;
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.038), MAT.carton);
    bottom.position.y = 0.002;
    item.add(carton, bottom);
    this.batches = [];
    this.setItem(item);
  }

  advance(i) {
    this.punch();
    const batch = new THREE.Group();
    this.item.add(batch);
    this.batches.push(batch);
    for (let j = 0; j < 9; j++) {
      const f = new THREE.Mesh(fryGeo, MAT.fry);
      f.castShadow = true;
      // Keep every fry (including its tilted bottom end) inside the tapered carton walls.
      const target = 0.078 + i * 0.02 + Math.random() * 0.01;
      f.position.set((Math.random() - 0.5) * 0.05, target + 0.3, (Math.random() - 0.5) * 0.016);
      f.rotation.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.28);
      batch.add(f);
      tween(0.22, (k) => { f.position.y = target + (1 - k) * 0.3; }, ease.outBounce, this, j * 0.012);
    }
    return wait(0.32);
  }

  rewind() {
    this.stopAnims();
    for (const batch of this.batches) {
      tween(0.25, (k) => {
        batch.position.y = k * 0.2;
        batch.scale.setScalar(Math.max(1 - k, 0.001));
      }, ease.inCubic, this).then(() => batch.removeFromParent());
    }
    this.batches = [];
  }
}

// ---------- drink: pour (S), pour (S), lid (W) ----------

const NOZZLE_Y = 0.42;

export class DrinkStation extends Station {
  constructor(scene) {
    super(scene, STATION_X.drink);
    this.buildDecor();
    this.buildItem();
  }

  buildDecor() {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.26), MAT.red);
    body.position.set(0, 0.3, -0.32);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.01), MAT.dark);
    panel.position.set(0, 0.5, -0.185);
    const button = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ color: 0x7cff6a }));
    button.position.set(0, 0.5, -0.179);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.22), MAT.dark);
    arm.position.set(0, NOZZLE_Y + 0.045, -0.1);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 12), MAT.steel);
    nozzle.position.set(0, NOZZLE_Y + 0.01, 0);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.18), std(0x333333, { metalness: 0.5, roughness: 0.4 }));
    tray.position.set(0, 0.006, -0.01);
    this.group.add(shadowify(body), panel, button, shadowify(arm), nozzle, shadowify(tray));

    const streamGeo = new THREE.CylinderGeometry(0.005, 0.005, 1, 8);
    streamGeo.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(streamGeo, MAT.cola);
    this.stream.position.y = NOZZLE_Y;
    this.stream.visible = false;
    this.group.add(this.stream);
  }

  buildItem() {
    const item = new THREE.Group();
    item.position.y = 0.012; // sits on the drip tray
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.04, 0.15, 28, 1, true), MAT.cup);
    cup.position.y = 0.075;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.04, 28), MAT.cup);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.001;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0503, 0.0478, 0.03, 28, 1, true), MAT.cupBand);
    band.position.y = 0.105;

    const liquidGeo = new THREE.CylinderGeometry(0.044, 0.038, 0.14, 28);
    liquidGeo.translate(0, 0.07, 0);
    this.liquid = new THREE.Mesh(liquidGeo, MAT.cola);
    this.liquid.position.y = 0.003;

    this.lid = new THREE.Group();
    const lidDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.01, 28), MAT.lid);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), MAT.straw);
    straw.position.set(0.012, 0.06, 0);
    straw.rotation.z = -0.12;
    this.lid.add(lidDisc, straw);
    this.lidRestY = 0.153;
    this.lid.position.y = this.lidRestY;

    item.add(cup, bottom, band, this.liquid, this.lid);
    this.setItem(item);
    this.setLevel(0);
    this.lid.visible = false;
  }

  setLevel(l) {
    this.level = l;
    this.liquid.visible = l > 0.01;
    this.liquid.scale.y = Math.max(l, 0.001);
  }

  pour(to) {
    const from = this.level;
    const setStream = () => {
      this.stream.scale.y = NOZZLE_Y - (0.012 + 0.003 + 0.14 * this.level);
    };
    setStream();
    this.stream.visible = true;
    return tween(0.28, (k) => {
      this.setLevel(from + (to - from) * k);
      setStream();
      if (k >= 1) this.stream.visible = false;
    }, ease.outCubic, this);
  }

  advance(i) {
    this.punch();
    if (i === 0) return this.pour(0.5);
    if (i === 1) return this.pour(0.95);
    this.lid.visible = true;
    return tween(0.35, (k) => { this.lid.position.y = this.lidRestY + (1 - k) * 0.25; }, ease.outBounce, this);
  }

  rewind() {
    this.stopAnims();
    this.stream.visible = false;
    this.lid.visible = false;
    const from = this.level;
    tween(0.3, (k) => this.setLevel(from * (1 - k)), ease.outCubic, this);
  }
}

// ---------- bag: fold left (A), fold right (D), stamp (S) ----------

const BAG = { w: 0.2, h: 0.19, d: 0.13 };

export class BagStation extends Station {
  constructor(scene) {
    super(scene, STATION_X.bag);
    this.buildItem();
  }

  buildItem() {
    const bag = new THREE.Group();
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BAG.w, BAG.h, BAG.d),
      [MAT.kraft, MAT.kraft, hidden, MAT.kraft, MAT.kraft, MAT.kraft]
    );
    body.position.y = BAG.h / 2;
    bag.add(body);

    const flapGeo = (dir) => {
      const g = new THREE.PlaneGeometry(BAG.w / 2, BAG.d);
      g.rotateX(-Math.PI / 2);
      g.translate((dir * BAG.w) / 4, 0, 0);
      return g;
    };
    const mk = (side, extraY) => {
      const pivot = new THREE.Group();
      pivot.position.set((-side * BAG.w) / 2, BAG.h + extraY, 0);
      pivot.add(new THREE.Mesh(flapGeo(side), MAT.kraft));
      bag.add(pivot);
      return { pivot, start: (side * Math.PI) / 2, k: 0 };
    };
    // Flaps start standing up (open bag) and fold flat to close it.
    this.flaps = [mk(1, 0), mk(-1, 0.002)];
    for (const f of this.flaps) this.setBagFlap(f, 0);

    const sticker = flatPlane(0.07, 0.07, MAT.sticker);
    sticker.position.y = BAG.h + 0.005;
    sticker.visible = false;
    bag.add(sticker);
    this.sticker = sticker;

    this.count = 0;
    this.setItem(bag);
  }

  setBagFlap(f, k) {
    f.k = k;
    f.pivot.rotation.z = f.start * (1 - k);
  }

  /** Fly a finished item into the bag. */
  receive(obj) {
    const bag = this.item;
    bag.attach(obj);
    const n = this.count++;
    const from = obj.position.clone();
    const fromS = obj.scale.x;
    const slots = [[0, 0], [-0.04, 0.02], [0.04, -0.02], [0, 0.03]];
    const [sx, sz] = slots[n % slots.length];
    const to = new THREE.Vector3(sx, 0.008 + Math.floor(n / slots.length) * 0.04, sz);
    return tween(0.55, (k) => {
      obj.position.lerpVectors(from, to, k);
      obj.position.y += Math.sin(k * Math.PI) * 0.35;
      obj.scale.setScalar(fromS + (0.32 - fromS) * k);
    }, ease.inOutCubic, 'flight');
  }

  advance(i) {
    this.punch();
    if (i < 2) {
      const f = this.flaps[i];
      const from = f.k;
      return tween(0.2, (k) => this.setBagFlap(f, from + (1 - from) * k), ease.outCubic, this);
    }
    this.sticker.visible = true;
    return tween(0.25, (k) => this.sticker.scale.setScalar(2.2 - 1.2 * k), ease.outBack, this);
  }

  rewind() {
    this.stopAnims();
    this.sticker.visible = false;
    this.sticker.scale.setScalar(1);
    for (const f of this.flaps) {
      const from = f.k;
      tween(0.25, (k) => this.setBagFlap(f, from * (1 - k)), ease.outCubic, this);
    }
  }

  /** Pass the sealed bag out the window into the customer's hands, then set up a fresh bag. */
  async handOffTo(guest) {
    cancelTweens(this);
    const bag = this.item;
    bag.scale.set(1, 1, 1);
    this.scene.attach(bag);
    const from = bag.position.clone();
    const to = guest.handWorld();
    await tween(0.6, (k) => {
      bag.position.lerpVectors(from, to, k);
      bag.position.y += Math.sin(k * Math.PI) * 0.3;
    }, ease.inOutCubic, this);
    guest.hold(bag);
    guest.mode = 'hold';
    this.buildItem();
    const fresh = this.item;
    fresh.scale.setScalar(0.001);
    tween(0.3, (k) => fresh.scale.setScalar(Math.max(k, 0.001)), ease.outBack, this, 0.4);
  }
}
