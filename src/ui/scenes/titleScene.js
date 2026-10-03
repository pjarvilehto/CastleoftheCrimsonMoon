// ui/scenes/titleScene.js — title screen -> CHOOSE YOUR HERO -> hub (0.00248), plus save transfer.

import { setBackground, go } from '../../core/scene.js';
import { el } from '../../core/dom.js';
import { DATA } from '../../shared/data.js';
import { getProfile, resetProfile } from '../../meta/profile.js';
import { loadProfile } from '../../meta/storage.js';
import { play } from '../../audio/music.js';
import { namePrompt } from '../namePrompt.js';
import { confirmPrompt } from '../confirmPrompt.js';
import { armOnGesture } from '../../audio/narrator.js';
import { recordsLine } from '../hubText.js';
import { isMobile, fullscreenOn, canFullscreen, enterFullscreen } from '../../shared/platform.js';
import { playIntro } from '../titleIntro.js';
import { sfx } from '../../audio/sfx.js';

// Enter the Castle takes a desktop full screen (0.00296, the developer's ask):
// the click is the gesture the browser wants; denied or unavailable, the game
// plays windowed, and Esc / the corner's icon leave it as before. A phone has
// its own PLAY gate and a tablet keeps its browser.
function enterFull() {
  if (!isMobile() && canFullscreen() && !fullscreenOn()) enterFullscreen();
}

export function titleScene() {
  return {
    enter(root) {
      play('title');
      armOnGesture('title_welcome'); // the narrator greets on the session's first click or key (0.161)
      const panel = render(root);
      // the fly-in (0.00307): over the painting just set, once per session; the
      // panel waits under the clip and fades in once its held last frame has
      // faded onto the painting (null: nothing to play, the title as before)
      const intro = playIntro();
      // (0.00309: the Descend strike as the panel comes up — the same huge tom as the hall's Descend and Push Deeper)
      if (intro) { panel.classList.add('intro-hold'); intro.then(() => { panel.classList.remove('intro-hold'); sfx('deeper'); }); }
    },
  };

  function wayIn() { go(getProfile().hero ? 'hub' : 'hero'); } // (a new game chooses its hero; a save that has, enters the hall)

  function render(root) {
    setBackground(DATA.backgrounds.title);
    const p = getProfile();

    root.innerHTML = '';
    const panel = (
      el('div', { class: 'panel title-panel' },
        el('h1', {}, 'CASTLE OF THE CRIMSON MOON'),
        el('div', { class: 'subtitle' }, 'A roguelite descent into the haunted keep'),
        p.records.runs > 0
          ? el('div', { class: 'subtitle' }, `Welcome back, ${p.name || 'adventurer'} — ${recordsLine(p)}`)
          : el('div', { class: 'subtitle' }, p.name ? `Your first descent awaits, ${p.name}.` : 'Your first descent awaits.'),
        el('div', { class: 'btn-row' },
          // 0.00200: a new player is asked their name on the way in (the prompt's button reads Enter the Castle), not over the title before seeing anything
          el('button', { class: 'primary', key: 'e', proceed: true, onclick: () => { enterFull(); return getProfile().name ? wayIn() : namePrompt(wayIn); } }, 'Enter the Castle'), // (0.00248: CHOOSE YOUR HERO, then the Great Hall; 0.00253: the hero once per save — chosen, straight to the hall)
          // Shown only when a save with progress exists: offer to wipe
          // (the game's own yes/no dialog, not the browser's).
          loadProfile() !== null && (p.records.runs > 0 || p.coins > 0 || p.xp > 0)
            ? el('button', {
                class: 'danger',
                key: 'n',
                onclick: () => confirmPrompt({
                  title: 'Start a New Game?',
                  lines: ['Your existing save will be permanently wiped.'],
                  yes: ['Wipe and Start Over', 'w'],
                  no: ['Keep My Save', 'k'],
                  onYes: () => { resetProfile(); render(root); },
                }),
              }, 'Start a New Game')
            : null),
        p.name
          ? el('div', { class: 'player-name' }, `Playing as ${p.name} · `,
              el('button', { class: 'link-btn', onclick: () => namePrompt(() => render(root)) }, 'change'))
          : null)
    ); // (0.00302: Export / Import Save moved to the SETTINGS menu's GAME group, ui/saveTransfer.js)
    root.append(panel);
    return panel;
  }
}
