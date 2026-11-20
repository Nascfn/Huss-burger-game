// Blocky toy-style party people. Each body part is a few rounded blocks merged into one mesh
// (with per-vertex colors), so a big crowd stays cheap to draw. Faces come from a drawn sprite sheet.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SKIN = [0xffdcb5, 0xf3c48f, 0xe0a46a, 0xc27e4a, 0x8d5524, 0x5e3a22];
const SHIRTS = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0xff7a3d, 0x9b5cff, 0xdedad2, 0x2b2b33, 0xe23b3b, 0x29e0b0, 0x3b6bff, 0xffa3c8];
const PANTS = [0x2a2f45, 0x1c1c22, 0x3b5bdb, 0x6b4f3a, 0x4a4a52, 0x7a2e8f, 0x2f6b4f, 0xd8c9a8];
const SHOES = [0xe2ded6, 0x1c1c22, 0xff3cac, 0xe23b3b, 0x2bd2ff, 0x6b4f3a];
const HAIR = [0x1d1410, 0x3b2314, 0x6b4423, 0xd9b26f, 0xb5462f, 0xff5fa2, 0x2bd2ff, 0x9b5cff, 0xcfcac2];
const HATS = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0x9b5cff, 0xff7a3d];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- geometry helpers ----------

const tmpColor = new THREE.Color();

/** A rounded block, moved into place and painted one color. */
export function block(w, h, d, color, x = 0, y = 0, z = 0, r = 0.03) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return paint(geo.translate(x, y, z), color);
}

/** A plain (sharp) box, moved into place and painted. Cheaper than `block` for big props. */
export function box(w, h, d, color, x = 0, y = 0, z = 0) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
}

export function paint(geo, color) {
  tmpColor.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function merged(parts) {
  // Rounded blocks are non-indexed while plain boxes/cones/cylinders are indexed; merging needs them to match.
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const geo = mergeGeometries(flat);
  parts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  return geo;
}

export const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });

// ---------- faces (sprite sheet: 4 x 2 expressions) ----------

export const FACE = { smile: 0, grin: 1, joy: 2, neutral: 3, meh: 4, angry: 5, love: 6, cool: 7 };

const faceCanvas = (() => {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 2;
  const g = c.getContext('2d');
  const ink = '#1d1410';

  const eyes = (ox, oy, kind) => {
    for (const side of [-1, 1]) {
      const ex = ox + 128 + side * 52;
      const ey = oy + 112;
      if (kind === 'happy') {
        g.strokeStyle = ink;
        g.lineWidth = 14;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(ex, ey + 10, 20, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else if (kind === 'heart') {
        g.fillStyle = '#ff2d6f';
        g.beginPath();
        g.moveTo(ex, ey + 22);
        g.bezierCurveTo(ex - 34, ey - 2, ex - 18, ey - 30, ex, ey - 10);
        g.bezierCurveTo(ex + 18, ey - 30, ex + 34, ey - 2, ex, ey + 22);
        g.fill();
      } else {
        g.fillStyle = ink;
        g.beginPath();
        g.roundRect(ex - 13, ey - 20, 26, 40, 9);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(ex - 6, ey - 13, 8, 10);
      }
    }
  };
  const brows = (ox, oy, tilt) => {
    g.strokeStyle = ink;
    g.lineWidth = 11;
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      const bx = ox + 128 + side * 52;
      g.beginPath();
      g.moveTo(bx - 20, oy + 70 + side * tilt);
      g.lineTo(bx + 20, oy + 70 - side * tilt);
      g.stroke();
    }
  };
  const blush = (ox, oy) => {
    g.fillStyle = 'rgba(255,110,130,0.45)';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(ox + 128 + side * 80, oy + 160, 22, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  const mouth = (ox, oy, kind) => {
    const mx = ox + 128;
    const my = oy + 180;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    if (kind === 'smile') {
      g.arc(mx, my - 22, 32, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    } else if (kind === 'open') {
      g.moveTo(mx - 38, my - 12);
      g.quadraticCurveTo(mx, my + 52, mx + 38, my - 12);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff6f7d';
      g.beginPath();
      g.ellipse(mx, my + 14, 16, 8, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'flat') {
      g.moveTo(mx - 28, my);
      g.lineTo(mx + 28, my);
      g.stroke();
    } else if (kind === 'frown') {
      g.arc(mx, my + 30, 30, 1.2 * Math.PI, 1.8 * Math.PI);
      g.stroke();
    } else if (kind === 'smirk') {
      g.moveTo(mx - 26, my + 2);
      g.quadraticCurveTo(mx + 6, my + 14, mx + 32, my - 10);
      g.stroke();
    }
  };

  const cell = (i) => [(i % 4) * S, Math.floor(i / 4) * S];
  let [x, y] = cell(FACE.smile); eyes(x, y); blush(x, y); mouth(x, y, 'smile');
  [x, y] = cell(FACE.grin); eyes(x, y); blush(x, y); mouth(x, y, 'open');
  [x, y] = cell(FACE.joy); eyes(x, y, 'happy'); blush(x, y); mouth(x, y, 'open');
  [x, y] = cell(FACE.neutral); eyes(x, y); mouth(x, y, 'flat');
  [x, y] = cell(FACE.meh); eyes(x, y); brows(x, y, -6); mouth(x, y, 'flat');
  [x, y] = cell(FACE.angry); eyes(x, y); brows(x, y, 14); mouth(x, y, 'frown');
  [x, y] = cell(FACE.love); eyes(x, y, 'heart'); blush(x, y); mouth(x, y, 'open');
  [x, y] = cell(FACE.cool);
  g.fillStyle = ink;
  g.beginPath();
  g.roundRect(x + 52, y + 88, 152, 48, 14);
  g.fill();
  g.fillStyle = '#5b6bff';
  g.fillRect(x + 64, y + 96, 48, 12);
  g.fillRect(x + 144, y + 96, 48, 12);
  mouth(x, y, 'smirk');
  return c;
})();

const faceTex = new THREE.CanvasTexture(faceCanvas);
faceTex.colorSpace = THREE.SRGBColorSpace;
faceTex.anisotropy = 4;
const faceMaterial = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, alphaTest: 0.3, roughness: 0.5 });

const FACE_SIZE = 0.33;
const faceGeos = Array.from({ length: 8 }, (_, i) => {
  const geo = new THREE.PlaneGeometry(FACE_SIZE, FACE_SIZE);
  const col = i % 4;
  const row = Math.floor(i / 4);
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 4, (1 - row + uv.getY(k)) / 2);
  return geo;
});

// ---------- soft blob shadow under each person ----------

const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

// ---------- build a person ----------

/**
 * Returns { root, body, head, face, legL, legR, armL, armR }. Faces +z.
 * Body layout (meters): legs 0-0.72, torso 0.72-1.28, head 1.30-1.66.
 */
export function makePerson({ partyHatChance = 0.3 } = {}) {
  const skin = pick(SKIN);
  const shirt = pick(SHIRTS);
  const pants = pick(PANTS);
  const shoes = pick(SHOES);
  const hairColor = pick(HAIR);

  const root = new THREE.Group();
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.012;
  shadow.renderOrder = -1;
  root.add(shadow);

  const body = new THREE.Group();
  root.add(body);

  // Torso: shirt + belt + optional stripe or jacket
  const torsoParts = [block(0.46, 0.5, 0.26, shirt, 0, 1.03, 0, 0.05), block(0.47, 0.08, 0.27, pants, 0, 0.77, 0, 0.03)];
  const style = Math.random();
  if (style < 0.3) torsoParts.push(block(0.47, 0.07, 0.27, pick(SHIRTS), 0, 1.06, 0, 0.02));
  else if (style < 0.45) {
    const jacket = pick([0x2b2b33, 0x3b5bdb, 0x6b4f3a, 0xe23b3b]);
    torsoParts.push(block(0.12, 0.5, 0.27, jacket, -0.175, 1.03, 0, 0.04), block(0.12, 0.5, 0.27, jacket, 0.175, 1.03, 0, 0.04));
  }
  const torso = new THREE.Mesh(merged(torsoParts), personMaterial);
  body.add(torso);

  // Head: skin block + ears + hair/hat (pivot at the neck so it can nod)
  const head = new THREE.Group();
  head.position.y = 1.29;
  const hp = [
    block(0.36, 0.36, 0.34, skin, 0, 0.18, 0, 0.06),
    block(0.05, 0.09, 0.07, skin, -0.195, 0.17, 0, 0.02),
    block(0.05, 0.09, 0.07, skin, 0.195, 0.17, 0, 0.02),
  ];
  const hair = pick(['short', 'short', 'long', 'afro', 'mohawk', 'cap', 'buzz', 'bun']);
  if (hair === 'short' || hair === 'long' || hair === 'bun') {
    hp.push(block(0.39, 0.1, 0.37, hairColor, 0, 0.36, -0.005, 0.04));
    hp.push(block(0.39, hair === 'long' ? 0.44 : 0.26, 0.08, hairColor, 0, hair === 'long' ? 0.15 : 0.22, -0.155, 0.03));
    hp.push(block(0.39, 0.07, 0.07, hairColor, 0, 0.33, 0.155, 0.03)); // fringe
    if (hair === 'long') {
      hp.push(block(0.06, 0.32, 0.3, hairColor, -0.195, 0.19, -0.03, 0.03), block(0.06, 0.32, 0.3, hairColor, 0.195, 0.19, -0.03, 0.03));
    }
    if (hair === 'bun') hp.push(block(0.16, 0.14, 0.16, hairColor, 0, 0.46, -0.06, 0.06));
  } else if (hair === 'afro') {
    hp.push(block(0.5, 0.32, 0.46, hairColor, 0, 0.36, -0.03, 0.13));
  } else if (hair === 'mohawk') {
    hp.push(block(0.09, 0.16, 0.36, hairColor, 0, 0.42, -0.01, 0.03));
  } else if (hair === 'buzz') {
    hp.push(block(0.37, 0.05, 0.35, hairColor, 0, 0.35, 0, 0.02));
  } else if (hair === 'cap') {
    const cap = pick(HATS);
    hp.push(block(0.39, 0.12, 0.37, cap, 0, 0.37, -0.005, 0.05), block(0.34, 0.03, 0.15, cap, 0, 0.33, 0.24, 0.015));
  }
  if (Math.random() < partyHatChance && hair !== 'afro' && hair !== 'cap') {
    const cone = paint(new THREE.ConeGeometry(0.11, 0.26, 4).rotateY(Math.PI / 4).translate(0.03, 0.54, 0), pick(HATS));
    hp.push(cone);
    hp.push(block(0.06, 0.06, 0.06, 0xffffff, 0.03, 0.68, 0, 0.03));
  }
  const headMesh = new THREE.Mesh(merged(hp), personMaterial);
  head.add(headMesh);
  const face = new THREE.Mesh(faceGeos[pick([FACE.smile, FACE.grin, FACE.joy, FACE.smile, FACE.cool])], faceMaterial);
  face.position.set(0, 0.17, 0.172);
  head.add(face);
  body.add(head);

  // Arms: pivot at the shoulder, hanging down -y
  const makeArm = (side) => {
    const g = merged([
      block(0.13, 0.3, 0.15, shirt, 0, -0.14, 0, 0.04),
      block(0.11, 0.2, 0.12, skin, 0, -0.38, 0, 0.035),
      block(0.12, 0.1, 0.13, skin, 0, -0.52, 0, 0.04),
    ]);
    const m = new THREE.Mesh(g, personMaterial);
    m.position.set(side * 0.3, 1.22, 0);
    body.add(m);
    return m;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Legs: pivot at the hip
  const makeLeg = (side) => {
    const g = merged([block(0.17, 0.6, 0.19, pants, 0, -0.32, 0, 0.04), block(0.18, 0.1, 0.26, shoes, 0, -0.66, 0.035, 0.04)]);
    const m = new THREE.Mesh(g, personMaterial);
    m.position.set(side * 0.11, 0.72, 0);
    body.add(m);
    return m;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  for (const m of [torso, headMesh, armL, armR, legL, legR]) m.castShadow = true;

  root.scale.setScalar(0.94 + Math.random() * 0.14);
  return { root, body, head, face, legL, legR, armL, armR };
}

export function setFace(p, expr) {
  p.face.geometry = faceGeos[expr];
}

export function disposePerson(p) {
  p.root.traverse((o) => {
    if (o.isMesh && o.geometry !== shadowGeo && !faceGeos.includes(o.geometry)) o.geometry.dispose();
  });
}

// ---------- poses ----------

function resetLimbs(p) {
  p.legL.rotation.set(0, 0, 0);
  p.legR.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.body.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
  p.body.position.y = 0;
}

/**
 * Dance to the beat. `beat` counts beats. Styles:
 * 0 fist pump, 1 sway, 2 jump, 3 chill head-nod, 4 both hands waving.
 */
export function poseDance(p, beat, style) {
  resetLimbs(p);
  const bounce = Math.abs(Math.sin(Math.PI * beat));
  p.head.rotation.x = bounce * 0.12;
  if (style === 0) {
    p.body.position.y = bounce * 0.05;
    p.armR.rotation.z = 2.5 + 0.5 * bounce;
    p.armL.rotation.z = -0.3 - 0.2 * bounce;
  } else if (style === 1) {
    const sway = Math.sin(Math.PI * beat * 0.5);
    p.body.position.y = bounce * 0.025;
    p.body.rotation.z = sway * 0.1;
    p.armR.rotation.z = 1.2 + 0.3 * sway;
    p.armL.rotation.z = -1.2 + 0.3 * sway;
  } else if (style === 2) {
    const j = Math.abs(Math.sin((Math.PI * beat) / 2));
    p.body.position.y = j * 0.16;
    p.legL.rotation.x = -j * 0.3;
    p.legR.rotation.x = -j * 0.3;
    p.armR.rotation.z = 2.7 + 0.2 * j;
    p.armL.rotation.z = -2.7 - 0.2 * j;
  } else if (style === 3) {
    p.body.position.y = bounce * 0.012;
    p.armR.rotation.x = -0.6; // holding a drink
    p.armR.rotation.z = 0.1;
    p.armL.rotation.z = -0.1;
  } else {
    const w = Math.sin(Math.PI * beat);
    p.body.position.y = bounce * 0.04;
    p.armR.rotation.z = 2.6 + 0.35 * w;
    p.armL.rotation.z = -2.6 + 0.35 * w;
  }
}

export function poseWalk(p, t) {
  resetLimbs(p);
  const s = Math.sin(t * 9);
  p.legL.rotation.x = s * 0.55;
  p.legR.rotation.x = -s * 0.55;
  p.armL.rotation.x = -s * 0.45;
  p.armR.rotation.x = s * 0.45;
  p.armL.rotation.z = -0.08;
  p.armR.rotation.z = 0.08;
  p.body.position.y = Math.abs(Math.cos(t * 9)) * 0.03;
}

/** Waiting in line. `eager` = waving at the window. */
export function poseWait(p, t, eager) {
  resetLimbs(p);
  p.body.position.y = Math.abs(Math.sin(t * 3)) * 0.01;
  if (eager) {
    p.armR.rotation.z = 2.6 + Math.sin(t * 9) * 0.35;
    p.armL.rotation.z = -0.12;
    p.head.rotation.z = Math.sin(t * 4.5) * 0.06;
  } else {
    p.armR.rotation.z = 0.1;
    p.armL.rotation.z = -0.1 - Math.max(0, Math.sin(t * 2)) * 0.15;
    p.head.rotation.y = Math.sin(t * 0.7) * 0.25;
  }
}

/** Holding a bag out in front, bobbing to the beat. */
export function poseHold(p, beat) {
  resetLimbs(p);
  p.body.position.y = Math.abs(Math.sin(Math.PI * beat)) * 0.035;
  p.head.rotation.x = Math.abs(Math.sin(Math.PI * beat)) * 0.1;
  p.armL.rotation.x = -1.25;
  p.armR.rotation.x = -1.25;
  p.armL.rotation.z = 0.2;
  p.armR.rotation.z = -0.2;
}

/** Where a held bag sits, in the person's local space. */
export const HOLD_POINT = new THREE.Vector3(0, 1.0, 0.44);
