import './style.css';
import { createWorld, CameraRig } from './scene.js';
import { BurgerStation, FriesStation, DrinkStation, BagStation } from './stations.js';
import { Party } from './party.js';
import { GameAudio } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { LEVELS } from './levels.js';
import { updateTweens } from './tween.js';
import { loadGame, saveGame } from './save.js';
import { setupTouch } from './touch.js';
import { AutoQuality } from './quality.js';

const save = loadGame();
const { renderer, scene, camera, composer, bloom, resize, maxRatio } = createWorld(document.getElementById('app'));
const quality = new AutoQuality({ renderer, bloom, resize, maxRatio });
const rig = new CameraRig(camera);

const stations = {
  burger: new BurgerStation(scene),
  fries: new FriesStation(scene),
  drink: new DrinkStation(scene),
};
const bag = new BagStation(scene);
const party = new Party(scene);

const audio = new GameAudio();
audio.load('huss_huss_huss.wav').catch((e) => console.error('Could not load huss sound', e));

const hud = new Hud();
const applyVolume = () => {
  audio.setVolume(save.settings.muted ? 0 : save.settings.volume);
  hud.setMuted(save.settings.muted);
};
const game = new Game({ audio, rig, stations, bag, party, hud, save });
applyVolume();

// Title screen: show the next party you haven't beaten yet, out the window.
const firstLevel = Math.min(save.unlocked, LEVELS.length - 1);
party.setLevel(LEVELS[firstLevel]);
audio.setTempo(LEVELS[firstLevel].bpm);
rig.focus(0.25);
game.showTitle();

hud.onPickLevel = (i) => game.startLevel(i);
document.getElementById('next-btn').addEventListener('click', () => game.startNext());
document.getElementById('list-btn').addEventListener('click', () => game.showTitle());

const toggleMute = () => {
  save.settings.muted = !save.settings.muted;
  applyVolume();
  saveGame(save);
};

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault(); // keep arrows from scrolling the page
  if (e.repeat) return;
  if (e.code === 'Enter') return game.startNext();
  if (e.code === 'KeyM') return toggleMute();
  game.onKey(e.code);
});

// Phones and tablets: an on-screen arrow pad sends the same keys as the keyboard.
setupTouch((code) => game.onKey(code));
document.getElementById('sound-btn').addEventListener('click', toggleMute);

window.addEventListener('resize', resize);
// Phones can rotate without a resize event firing right away.
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// Debug handle for testing in the browser console.
window.__game = game;
window.__renderer = renderer;
window.__quality = quality;

let last = performance.now();
renderer.setAnimationLoop((now) => {
  quality.frame(now - last);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateTweens(dt);
  game.update(dt);
  party.update(dt, audio.beatTime());
  rig.update(dt);
  composer.render(dt);
});
