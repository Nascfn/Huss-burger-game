// Every item ALWAYS uses the same key sequence, so players can learn it by heart.
// To make the game harder later: add more steps per item, or shuffle the item order on tickets.

export const RECIPES = {
  burger: { name: 'Burger', label: 'Wrap the burger', keys: ['KeyA', 'KeyD', 'KeyW'] },
  fries: { name: 'Fries', label: 'Scoop the fries', keys: ['KeyS', 'KeyW', 'KeyD'] },
  drink: { name: 'Drink', label: 'Pour the drink', keys: ['KeyS', 'KeyS', 'KeyW'] },
  bag: { name: 'Bag it', label: 'Seal the bag', keys: ['KeyA', 'KeyD', 'KeyS'] },
};

export const QTE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
export const keyLabel = (code) => code.replace('Key', '');

export const SHIFT_LENGTH = 5;

// The first orders teach one new item at a time.
const SCRIPTED = [['burger'], ['burger', 'fries'], ['drink', 'burger']];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function makeOrder(n) {
  let items;
  if (n <= SCRIPTED.length) {
    items = [...SCRIPTED[n - 1]];
  } else {
    items = ['burger', 'fries', 'drink'];
    if (n >= 5) items.push(items[Math.floor(Math.random() * 3)]);
    shuffle(items);
  }
  return {
    number: n,
    items,
    // Seconds allowed per key press; shrinks as the shift goes on.
    window: Math.max(0.8, 1.9 - 0.22 * (n - 1)),
    // Seconds before the speed bonus runs out.
    patience: 8 + items.length * 6,
  };
}
