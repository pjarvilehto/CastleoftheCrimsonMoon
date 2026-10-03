// ui/scenes/heroScene.js — CHOOSE YOUR HERO (0.00248, the developer's
// layout from the Hero Lab's second draft): between the title's Enter the
// Castle and the Great Hall, over the hall's own painting, so PROCEED fades
// this screen's pieces out and the hall's in with the painting never
// changing. The heroes' cards in a row (heroes.json, shared/heroes.js) on
// the enemy frame, the chosen one lifted with a breathing gold rim and a
// slow red pulse on its plate; under
// it the look switcher (‹ › = the arrow keys; a hero's looks are its
// sheets, one to eight so far — a hero with one look hides it); a bar with
// the hero's lines and PROCEED (Space). 1-7 and a click choose. The pick lands on the
// profile (hero: { id, look }) on PROCEED only; the knight's card and the
// hall draw it from then on (shared/portraits.js), and the class plays its
// own game since 0.00267 (heroes.json class: its heavy and passives).
// 0.00253 (the developer's call): the class is chosen ONCE per save — a
// new game comes here, a save that has chosen goes straight to the hall;
// the look alone can change later, from the hall's portrait (ui/lookPicker.js).

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { getProfile, persist } from '../../meta/profile.js';
import { heroList, heroById, cleanHero, lookUrl, lookOf, heroKit } from '../../shared/heroes.js';
import { play } from '../../audio/music.js';

// The class's kit replaces the default starting gear slot by slot (the knight's kit is that gear: no change).
export function wearKit(p, hero) {
  const g = DATA.difficulty.player.startingGear, kit = heroKit(hero);
  for (const slot of ['weapon', 'armor']) if (p.equipment?.[slot] === g[slot] && kit?.[slot]) p.equipment[slot] = kit[slot];
}

export function heroScene() {
  return {
    enter(root) {
      play('title'); // (the hall's bed: it carries on through PROCEED)
      setBackground(DATA.backgrounds.hub);
      render(root);
    },
    relayout(root) { render(root); }, // the phone query flipped (main.js watchPhoneLayout)
  };

  function render(root) {
    const heroes = heroList();
    const start = cleanHero(getProfile().hero);
    let chosen = start.id;
    const looks = Object.fromEntries(heroes.map((h) => [h.id, h.id === start.id ? start.look : 0])); // a look per hero, kept while the player compares

    const cards = {};
    const figures = {};
    const row = el('div', { class: 'hero-row', style: `--n:${heroes.length}` }, ...heroes.map((h, i) => {
      const figure = el('img', { class: 'figure', src: lookUrl(h, looks[h.id]), style: `--fh:${lookOf(h, looks[h.id]).fh}`, alt: h.name, draggable: 'false' });
      figures[h.id] = figure;
      const card = el('div', { class: 'hero', 'data-hero': h.id, style: `--theme:${h.theme.plate}`, onclick: () => choose(h.id) }, // (0.00254: the class's colour on the plate and in the pulse)
        el('div', { class: 'plate' }, el('div', { class: 'tone' })), el('div', { class: 'pulse' }), el('div', { class: 'rim' }),
        figure,
        el('button', { class: 'num', key: String(i + 1), onclick: (e) => { e?.stopPropagation?.(); choose(h.id); } }, String(i + 1)),
        el('div', { class: 'name' }, h.name.replace(/^The /, ''), el('small', {}, h.epithet)));
      cards[h.id] = card;
      return card;
    }));
    // the look switcher: one element, moved under the chosen card
    const dots = el('div', { class: 'dots' });
    const which = el('span', { class: 'which' });
    const switcher = el('div', { class: 'looks', onclick: (e) => e?.stopPropagation?.() },
      el('button', { key: 'ArrowLeft', title: 'Previous look', onclick: () => turn(-1) }, '‹'),
      dots,
      el('button', { key: 'ArrowRight', title: 'Next look', onclick: () => turn(1) }, '›'),
      which);
    const detail = el('div', { class: 'panel hero-detail' });

    root.append(el('div', { class: 'hero-screen' },
      el('div', { class: 'hero-head' }, el('h1', {}, 'CHOOSE YOUR HERO'), el('div', { class: 'subtitle' }, 'Who walks into the castle tonight?')),
      row, detail));
    update();

    function choose(id) { if (heroById(id)) { chosen = id; update(); } }
    function turn(d) {
      const h = heroById(chosen), n = h.looks.length;
      looks[chosen] = (looks[chosen] + d + n) % n;
      figures[chosen].setAttribute('src', lookUrl(h, looks[chosen]));
      figures[chosen].setAttribute('style', `--fh:${lookOf(h, looks[chosen]).fh}`);
      update();
    }
    function proceed() {
      const p = getProfile();
      // a new save puts on the class's starting kit (0.00265, heroes.json kit): only over the default starting gear, never over a find
      if (!p.hero) wearKit(p, heroById(chosen));
      p.hero = cleanHero({ id: chosen, look: looks[chosen] });
      persist();
      go('hub');
    }
    function update() {
      const h = heroById(chosen);
      for (const [id, card] of Object.entries(cards)) card.classList.toggle('chosen', id === chosen);
      switcher.remove(); cards[chosen].append(switcher);
      const n = h.looks.length;
      dots.innerHTML = ''; dots.append(...Array.from({ length: n }, (_, i) => el('i', { class: i === looks[chosen] ? 'on' : '' })));
      which.textContent = `Look ${looks[chosen] + 1} of ${n}`;
      switcher.classList.toggle('single', n < 2);
      detail.innerHTML = '';
      detail.append(
        el('h2', {}, h.name), el('div', { class: 'epithet' }, h.epithet), el('p', { class: 'lore' }, h.lore),
        el('div', { class: 'traits' }, ...h.traits.map((t) => el('span', {}, t))),
        el('div', { class: 'btn-row' }, el('button', { class: 'primary active', key: 'p', proceed: true, onclick: proceed }, 'Proceed')));
    }
  }
}
