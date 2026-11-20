// All on-screen (DOM) UI: ticket, score, recipes, key prompt, overlays.
import { RECIPES, keyLabel } from './orders.js';

const $ = (id) => document.getElementById(id);
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

  showTitle(save) {
    $('title').classList.remove('hidden');
    $('summary').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('title-best').textContent = save.highScore ? `Best score: ${save.highScore}` : '';
  }

  showPlaying() {
    $('title').classList.add('hidden');
    $('summary').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.hidePrompt();
    this.hideTicket();
  }

  showSummary(stats, save, isNewBest) {
    $('hud').classList.add('hidden');
    $('summary').classList.remove('hidden');
    $('new-best').classList.toggle('hidden', !isNewBest);
    const total = stats.hits + stats.misses;
    const acc = total ? Math.round((stats.hits / total) * 100) : 100;
    const rows = [
      ['Score', stats.score],
      ['Orders packed', stats.orders],
      ['Accuracy', `${acc}%`],
      ['Perfect steps', `${stats.perfectSteps} / ${stats.steps}`],
      ['Best combo', stats.bestCombo],
      ['High score', save.highScore],
      ['Lifetime huss', save.totalHuss],
    ];
    $('summary-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  // ----- score -----

  setScore(stats, mult) {
    $('score').textContent = stats.score;
    $('combo').textContent = stats.combo ? `COMBO ${stats.combo} · x${mult}` : '';
  }

  // ----- ticket -----

  showTicket(order) {
    $('order-num').textContent = `#${order.number}`;
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
