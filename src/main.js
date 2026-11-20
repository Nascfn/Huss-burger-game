import './style.css';
import { createWorld, CameraRig } from './scene.js';
import { BurgerStation, FriesStation, DrinkStation, BagStation } from './stations.js';
import { GameAudio } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { updateTweens } from './tween.js';
import { loadGame, saveGame } from './save.js';

const save = loadGame();
const { renderer, scene, camera } = createWorld(document.getElementById('app'));
const rig = new CameraRig(camera);

const stations = {
  burger: new BurgerStation(scene),
  fries: new FriesStation(scene),
  drink: new DrinkStation(scene),
};
const bag = new BagStation(scene);

const audio = new GameAudio();
audio.load('huss_huss_huss.wav').catch((e) => console.error('Could not load huss sound', e));
const applyVolume = () => {
  audio.setVolume(save.settings.muted ? 0 : save.settings.volume);
  hud.setMuted(save.settings.muted);
};

const hud = new Hud();
const game = new Game({ audio, rig, stations, bag, hud, save });
applyVolume();
hud.showTitle(save);

const start = () => {
  if (game.state === 'title' || game.state === 'summary') game.startShift();
};
document.getElementById('start-btn').addEventListener('click', start);
document.getElementById('again-btn').addEventListener('click', start);

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow')) e.preventDefault(); // keep arrows from scrolling the page
  if (e.repeat) return;
  if (e.code === 'Enter') return start();
  if (e.code === 'KeyM') {
    save.settings.muted = !save.settings.muted;
    applyVolume();
    saveGame(save);
    return;
  }
  game.onKey(e.code);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for testing in the browser console.
window.__game = game;

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateTweens(dt);
  game.update(dt);
  rig.update(dt);
  renderer.render(scene, camera);
});
