// Every item ALWAYS uses the same key sequence, so players can learn it by heart.
// To make the game harder later: add more steps per item, or shuffle the item order on tickets.

export const RECIPES = {
  burger: { name: 'Burger', label: 'Wrap the burger', keys: ['KeyA', 'KeyD', 'KeyW'] },
  fries: { name: 'Fries', label: 'Scoop the fries', keys: ['KeyS', 'KeyW', 'KeyD'] },
  drink: { name: 'Drink', label: 'Pour the drink', keys: ['KeyS', 'KeyS', 'KeyW'] },
  bag: { name: 'Bag it', label: 'Seal the bag', keys: ['KeyA', 'KeyD', 'KeyS'] },
};

export const QTE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

// Arrow keys and WASD both work; arrows are what the UI shows.
const ARROW_TO_WASD = { ArrowUp: 'KeyW', ArrowLeft: 'KeyA', ArrowDown: 'KeyS', ArrowRight: 'KeyD' };
const ARROW_ROTATION = { KeyW: 0, KeyD: 90, KeyS: 180, KeyA: 270 };

/** Turn any accepted key (arrow or WASD) into its WASD code. */
export const normalizeKey = (code) => ARROW_TO_WASD[code] || code;

/** HTML for a key's on-screen label: a chunky arrow drawn as SVG so all four match. */
export const keyLabel = (code) =>
  `<svg class="arrow" viewBox="0 0 24 24" style="transform: rotate(${ARROW_ROTATION[code]}deg)">` +
  `<path d="M12 2 L21 12 H15.5 V22 H8.5 V12 H3 Z" fill="currentColor"/></svg>`;

// The first party teaches one new item at a time.
const TUTORIAL = [['burger'], ['burger', 'fries'], ['drink', 'burger'], ['fries', 'drink']];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Order `n` (1-based) of a party. Orders get bigger and faster as the party goes on. */
export function makeOrder(level, n, levelIndex) {
  let items;
  if (levelIndex === 0 && n <= TUTORIAL.length) {
    items = [...TUTORIAL[n - 1]];
  } else {
    const [min, max] = level.items;
    const t = level.orders > 1 ? (n - 1) / (level.orders - 1) : 1;
    const count = Math.min(max, min + Math.floor(t * (max - min + 1)));
    const pool = shuffle(['burger', 'fries', 'drink']);
    items = pool.slice(0, Math.min(count, 3));
    while (items.length < count) items.push(pool[Math.floor(Math.random() * 3)]);
    shuffle(items);
  }
  return {
    number: n,
    items,
    // Seconds allowed per key press; shrinks as the party goes on.
    window: Math.max(0.8, level.window - 0.04 * (n - 1)),
    // Seconds before the customer gets annoyed.
    patience: 8 + items.length * 6,
  };
}
