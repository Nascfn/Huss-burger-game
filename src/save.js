// Progress is saved in the browser's localStorage (no backend needed).

const SAVE_KEY = 'huss_huss_huss_save';
const SAVE_VERSION = 1;

function defaults() {
  return {
    version: SAVE_VERSION,
    highScore: 0,
    bestCombo: 0,
    shiftsPlayed: 0,
    totalOrders: 0,
    totalHuss: 0,
    settings: { muted: false, volume: 0.9 },
  };
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    const base = defaults();
    // Merge so fields added in later versions get default values.
    return { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
  } catch {
    return defaults();
  }
}

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Save failed', e);
  }
}
