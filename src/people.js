// Low-poly party people built from simple shapes, plus their poses.
import * as THREE from 'three';

const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a21];
const SHIRTS = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0xff7a3d, 0x9b5cff, 0xffffff, 0x2b2b2b, 0xe23b3b, 0x29e0b0];
const PANTS = [0x2a2f45, 0x1c1c1c, 0x3b5bdb, 0x6b4f3a, 0x444444, 0x7a2e8f];
const HAIR = [0x1d1410, 0x3b2314, 0x6b4423, 0xd9b26f, 0xb5462f, 0xff5fa2, 0x2bd2ff];
const HATS = [0xff3cac, 0x2bd2ff, 0xffd23f, 0x7cff6a, 0x9b5cff];

const geo = {
  leg: new THREE.CylinderGeometry(0.065, 0.055, 0.78, 8).translate(0, -0.39, 0),
  torso: new THREE.CapsuleGeometry(0.17, 0.36, 4, 10),
  head: new THREE.SphereGeometry(0.13, 16, 12),
  arm: new THREE.CapsuleGeometry(0.045, 0.42, 4, 8).translate(0, -0.24, 0),
  eye: new THREE.SphereGeometry(0.018, 8, 6),
  partyHat: new THREE.ConeGeometry(0.075, 0.22, 12),
  hair: new THREE.SphereGeometry(0.137, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  shades: new THREE.BoxGeometry(0.19, 0.04, 0.03),
};

const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
  return matCache.get(color);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Returns { root, body, legL, legR, armL, armR }. The person faces +z. */
export function makePerson() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const pants = mat(pick(PANTS));
  const shirt = mat(pick(SHIRTS));
  const skin = mat(pick(SKIN));

  const legL = new THREE.Mesh(geo.leg, pants);
  legL.position.set(-0.085, 0.8, 0);
  const legR = new THREE.Mesh(geo.leg, pants);
  legR.position.set(0.085, 0.8, 0);
  const torso = new THREE.Mesh(geo.torso, shirt);
  torso.position.y = 1.13;
  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 1.62;
  const eyeMat = mat(0x111111);
  const eyeL = new THREE.Mesh(geo.eye, eyeMat);
  eyeL.position.set(-0.045, 1.64, 0.118);
  const eyeR = new THREE.Mesh(geo.eye, eyeMat);
  eyeR.position.set(0.045, 1.64, 0.118);
  const armL = new THREE.Mesh(geo.arm, shirt);
  armL.position.set(-0.22, 1.42, 0);
  const armR = new THREE.Mesh(geo.arm, shirt);
  armR.position.set(0.22, 1.42, 0);
  body.add(legL, legR, torso, head, eyeL, eyeR, armL, armR);

  // Accessories
  const r = Math.random();
  if (r < 0.35) {
    const hat = new THREE.Mesh(geo.partyHat, mat(pick(HATS)));
    hat.position.set(0.02, 1.83, 0);
    hat.rotation.z = -0.15;
    body.add(hat);
  }
  if (r >= 0.2) {
    const hair = new THREE.Mesh(geo.hair, mat(pick(HAIR)));
    hair.position.y = 1.635;
    hair.rotation.x = -0.25;
    body.add(hair);
  }
  if (Math.random() < 0.2) {
    const shades = new THREE.Mesh(geo.shades, mat(0x111111));
    shades.position.set(0, 1.645, 0.12);
    body.add(shades);
  }

  root.scale.setScalar(0.92 + Math.random() * 0.16);
  return { root, body, legL, legR, armL, armR };
}

function resetLimbs(p) {
  p.legL.rotation.set(0, 0, 0);
  p.legR.rotation.set(0, 0, 0);
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.body.rotation.set(0, 0, 0);
}

/** Dance to the beat. `beat` counts beats (1 per kick), `style` 0..2. */
export function poseDance(p, beat, style) {
  resetLimbs(p);
  const bounce = Math.abs(Math.sin(Math.PI * beat));
  if (style === 0) {
    // fist pump
    p.body.position.y = bounce * 0.06;
    p.armR.rotation.z = 2.5 + 0.5 * bounce;
    p.armL.rotation.z = -0.3 - 0.2 * bounce;
  } else if (style === 1) {
    // sway with arms out
    const sway = Math.sin(Math.PI * beat * 0.5);
    p.body.position.y = bounce * 0.03;
    p.body.rotation.z = sway * 0.12;
    p.armR.rotation.z = 1.3 + 0.3 * sway;
    p.armL.rotation.z = -1.3 + 0.3 * sway;
  } else {
    // jump with both hands up every other beat
    const j = Math.abs(Math.sin((Math.PI * beat) / 2));
    p.body.position.y = j * 0.16;
    p.armR.rotation.z = 2.7 + 0.2 * j;
    p.armL.rotation.z = -2.7 - 0.2 * j;
  }
}

export function poseWalk(p, t) {
  resetLimbs(p);
  const s = Math.sin(t * 9);
  p.legL.rotation.x = s * 0.5;
  p.legR.rotation.x = -s * 0.5;
  p.armL.rotation.x = -s * 0.4;
  p.armR.rotation.x = s * 0.4;
  p.armL.rotation.z = -0.1;
  p.armR.rotation.z = 0.1;
  p.body.position.y = Math.abs(Math.cos(t * 9)) * 0.03;
}

/** Waiting in line. `eager` = waving at the window. */
export function poseWait(p, t, eager) {
  resetLimbs(p);
  p.body.position.y = Math.abs(Math.sin(t * 3)) * 0.012;
  if (eager) {
    p.armR.rotation.z = 2.6 + Math.sin(t * 9) * 0.35;
    p.armL.rotation.z = -0.15;
  } else {
    p.armR.rotation.z = 0.12;
    p.armL.rotation.z = -0.12 - Math.max(0, Math.sin(t * 2)) * 0.2;
  }
}

/** Holding a bag out in front, bobbing to the beat. */
export function poseHold(p, beat) {
  resetLimbs(p);
  p.body.position.y = Math.abs(Math.sin(Math.PI * beat)) * 0.04;
  p.armL.rotation.x = -1.25;
  p.armR.rotation.x = -1.25;
  p.armL.rotation.z = 0.25;
  p.armR.rotation.z = -0.25;
}

/** Where a held bag sits, in the person's local space. */
export const HOLD_POINT = new THREE.Vector3(0, 1.1, 0.42);
