// Touch controls for phones and tablets: an on-screen arrow pad that feeds the
// same key codes into the game as the keyboard does.
import { keyLabel } from './orders.js';

/** True on phones and tablets (a finger is the main way to point). */
export const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

/** `onKey(code)` gets called with 'KeyW' / 'KeyA' / 'KeyS' / 'KeyD' for each tap. */
export function setupTouch(onKey) {
  const body = document.body;
  if (isTouchDevice()) body.classList.add('touch');
  // A laptop with a touch screen: show the pad as soon as someone touches it,
  // and hide it again if they go back to the keyboard.
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') body.classList.add('touch');
  });
  window.addEventListener('keydown', (e) => {
    if (!isTouchDevice()) body.classList.remove('touch');
  });

  for (const btn of document.querySelectorAll('#touch-pad .pad-btn')) {
    const code = btn.dataset.key;
    btn.innerHTML = keyLabel(code);
    // pointerdown (not click) so a tap counts the instant the finger lands.
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      onKey(code);
    });
    const release = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }

  // Long-pressing the pad shouldn't pop up a menu or start selecting text.
  document.getElementById('touch-pad').addEventListener('contextmenu', (e) => e.preventDefault());
}
