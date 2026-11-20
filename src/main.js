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

const save = loadGame();
const { renderer, scene, camera, composer, resize } = createWorld(document.getElementById('app'));
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

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault(); // keep arrows from scrolling the page
  if (e.repeat) return;
  if (e.code === 'Enter') return game.startNext();
  if (e.code === 'KeyM') {
    save.settings.muted = !save.settings.muted;
    applyVolume();
    saveGame(save);
    return;
  }
  game.onKey(e.code);
});

window.addEventListener('resize', resize);

// Debug handle for testing in the browser console.
window.__game = game;

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateTweens(dt);
  game.update(dt);
  party.update(dt, audio.beatTime());
  rig.update(dt);
  composer.render(dt);
});
