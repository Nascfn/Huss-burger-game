// All on-screen (DOM) UI: party progress, ticket, combo, recipes, key prompt, overlays.
import { RECIPES, keyLabel } from './orders.js';

const $ = (id) => document.getElementById(id);
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const RING_C = 2 * Math.PI * 44;

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export class Hud {
  constructor() {
    this.ring = $('ring');
    this.ring.style.strokeDasharray = RING_C;
    this.renderRecipes();
  }

  renderRecipes() {
    const html = Object.values(RECIPES)
      .map(
        (r) =>
          `<div class="recipe-row"><span class="recipe-name">${r.name}</span>` +
          r.keys.map((k) => `<kbd>${keyLabel(k)}</kbd>`).join('') +
          `</div>`
      )
      .join('');
    document.querySelectorAll('.recipe-list').forEach((el) => (el.innerHTML = html));
  }

  // ----- screens -----

  /** Title screen with a card per party. Locked parties can't be picked yet. */
  showTitle(save, levels) {
    $('title').classList.remove('hidden');
    $('summary').classList.add('hidden');
    $('hud').classList.add('hidden');
    const list = $('level-list');
    list.innerHTML = '';
    levels.forEach((lv, i) => {
      const locked = i > save.unlocked;
      const stars = save.levels[lv.id]?.stars || 0;
      const btn = document.createElement('button');
      btn.className = `level-card${locked ? ' locked' : ''}${i === Math.min(save.unlocked, levels.length - 1) ? ' current' : ''}`;
      btn.disabled = locked;
      btn.innerHTML =
        `<span class="lv-emoji">${locked ? '🔒' : lv.emoji}</span>` +
        `<span class="lv-num">Party ${i + 1}</span>` +
        `<span class="lv-name">${lv.name}</span>` +
        `<span class="lv-stars">${starText(stars)}</span>`;
      btn.addEventListener('click', () => this.onPickLevel?.(i));
      list.appendChild(btn);
    });
  }

  showPlaying(level) {
    $('title').classList.add('hidden');
    $('summary').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('party-name').textContent = level.name;
    this.hidePrompt();
    this.hideTicket();
  }

  /** Big "Party 2: Birthday Bash" title card when a party starts. */
  showBanner(level, i) {
    const el = $('banner');
    el.innerHTML = `<div class="b-num">Party ${i + 1}</div><div class="b-name">${level.emoji} ${level.name}</div><div class="b-blurb">${level.blurb}</div>`;
    restartAnim(el, 'show');
  }

  showSummary({ level, stats, stars, next, unlockedNew, isLast }) {
    $('hud').classList.add('hidden');
    $('summary').classList.remove('hidden');
    $('sum-title').textContent = isLast ? 'You fed HUSS FEST!' : 'Party fed!';
    $('sum-party').textContent = `${level.emoji} ${level.name}`;
    const starsEl = $('sum-stars');
    starsEl.innerHTML = [0, 1, 2].map((k) => `<span class="${k < stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.25}s">★</span>`).join('');
    restartAnim(starsEl, 'show');
    const total = stats.hits + stats.misses;
    const acc = total ? Math.round((stats.hits / total) * 100) : 100;
    const rows = [
      ['Happy guests', `${stats.happy} / ${stats.orders}`],
      ['Accuracy', `${acc}%`],
      ['Perfect steps', `${stats.perfectSteps} / ${stats.steps}`],
      ['Best combo', stats.bestCombo],
    ];
    $('summary-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('sum-unlock').classList.toggle('hidden', !unlockedNew);
    if (unlockedNew) $('sum-unlock').textContent = `Unlocked: ${next.emoji} ${next.name}`;
    $('sum-hint').textContent = stars < 3 ? '3 stars: keep every guest happy and hit 90% of your presses.' : 'Perfect party!';
    $('next-btn').textContent = isLast ? 'Play again' : `Next party: ${next.name}`;
  }

  // ----- progress / combo -----

  /** `frac` = how much of the party's work is still left (1 = all, 0 = done). */
  setProgress(frac) {
    $('progress-fill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  setCombo(n) {
    const el = $('combo');
    el.querySelector('.combo-num').textContent = n;
    el.classList.toggle('hot', n >= 10);
    if (n > 0) restartAnim(el.querySelector('.combo-num'), 'bump');
  }

  // ----- ticket -----

  showTicket(order, guestName) {
    $('order-num').textContent = `#${order.number}`;
    $('ticket-guest').textContent = `for ${guestName}`;
    const rows = [...order.items.map((t) => RECIPES[t].name), RECIPES.bag.name];
    $('ticket-items').innerHTML = rows.map((n) => `<li>${n}</li>`).join('');
    $('ticket').classList.remove('hidden');
    restartAnim($('ticket'), 'slide-in');
  }

  hideTicket() {
    $('ticket').classList.add('hidden');
  }

  setActiveItem(i) {
    [...$('ticket-items').children].forEach((li, j) => li.classList.toggle('active', j === i));
  }

  markItemDone(i) {
    const li = $('ticket-items').children[i];
    if (li) {
      li.classList.remove('active');
      li.classList.add('done');
    }
  }

  setPatience(frac) {
    const el = $('patience-fill');
    el.style.width = `${frac * 100}%`;
    el.classList.toggle('low', frac < 0.3);
  }

  // ----- key prompt -----

  showPrompt(step) {
    $('prompt').classList.remove('hidden');
    $('step-label').textContent = step.recipe.label;
    this.updatePrompt(step);
    this.setTimer(1);
  }

  hidePrompt() {
    $('prompt').classList.add('hidden');
  }

  /** fx: undefined | 'hit' | 'miss' */
  updatePrompt(step, fx) {
    const wrap = $('key-wrap');
    const keyEl = $('key');
    const done = step.idx >= 3;
    if (fx === 'miss') {
      keyEl.innerHTML = keyLabel(step.recipe.keys[step.idx]);
      wrap.classList.remove('waiting');
      restartAnim(wrap, 'miss');
    } else {
      wrap.classList.remove('miss');
      keyEl.innerHTML = done ? '✓' : keyLabel(step.recipe.keys[step.idx]);
      wrap.classList.toggle('waiting', !step.accepting && !done);
      wrap.classList.toggle('done', done);
      if (fx === 'hit') restartAnim(keyEl, 'pop');
    }
    [...$('pips').children].forEach((p, j) => p.classList.toggle('on', j < step.idx));
    if (fx !== 'miss' && step.accepting) this.setTimer(1);
  }

  setTimer(frac) {
    this.ring.style.strokeDashoffset = RING_C * (1 - frac);
    this.ring.classList.toggle('low', frac < 0.35);
  }

  // ----- feedback -----

  flash(text, cls) {
    const el = $('flash');
    el.textContent = text;
    el.className = cls;
    restartAnim(el, 'show');
  }

  popup(text) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.left = `${50 + (Math.random() - 0.5) * 8}%`;
    $('popups').appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  setMuted(muted) {
    $('mute').textContent = muted ? 'Sound off (M)' : 'Sound on (M)';
  }
}
