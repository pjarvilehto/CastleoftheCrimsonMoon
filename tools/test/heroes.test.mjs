// tools/test/heroes.test.mjs — the character classes (0.00248): heroes.json
// and shared/heroes.js, the pick on the profile (save version 5, an
// imported code made whole), CHOOSE YOUR HERO between the title and the
// hall (1-5 and a click choose, the arrows turn the look, Proceed lands the
// pick and leads on), and the knight's card and the hall drawing the hero.

import { ok, sleep, t, fresh, registry, DATA, show, handleKey, heroScene, titleScene, resetProfile, getProfile, readFileSync, statSync } from './harness.mjs';

const { heroList, heroById, defaultHero, cleanHero, heroOf, lookUrl, heroArtUrls, HERO_DIR } = await import('../../src/shared/heroes.js');
const { portraitUrl } = await import('../../src/shared/portraits.js');
const { SAVE_VERSION, migrateProfile } = await import('../../src/meta/migrations.js');
const { checkData } = await import('../../src/shared/dataCheck.js');

// the data
{
  fresh();
  const ids = heroList().map((h) => h.id);
  ok('five heroes, the knight the default', ids.join() === 'knight,barbarian,wizard,necromancer,druid' && defaultHero().id === 'knight');
  ok('every look of every hero is a file on disk, four looks each until the variations land', heroList().every((h) => h.looks.length === 4 && h.looks.every((f) => statSync(`${HERO_DIR}/${f}`).isFile()))
    && heroArtUrls().length === 5);
  ok('the preloader fetches the figures first among the essentials (the screen follows the title)', (await import('../../src/shared/preload.js')).essentialUrls().slice(0, 5).join() === heroArtUrls().join());
  const broken = structuredClone(DATA); broken.heroes = { default: 'paladin', heroes: [{ id: 'x', name: 'X', fh: 2, looks: [], traits: 'no' }] };
  const probs = checkData(broken);
  ok('data check: a hero needs a share, looks, lines, and the default must exist', ['fh', 'looks', 'epithet', 'default (paladin)'].every((m) => probs.some((p) => p.includes(m))), probs.join('; '));
}

// the profile: the pick, the migration, an imported code
{
  fresh();
  ok('a fresh profile plays the knight at its first look, at save version 5', SAVE_VERSION === 5 && getProfile().saveVersion === 5 && getProfile().hero.id === 'knight' && getProfile().hero.look === 0);
  const old = { saveVersion: 4, stats: {}, alchemy: {}, records: {}, name: 'Old', coins: 1, xp: 1, potions: 2, potionCap: 4, equipment: null };
  migrateProfile(old, (await import('../../src/meta/profile.js')).DEFAULTS ?? { coins: 0, xp: 0, potions: 2, potionCap: 4, potionsBought: 0, stats: {}, alchemy: {}, records: {} });
  ok('a v4 save gains the knight (every save so far played him)', old.saveVersion === 5 && old.hero.id === 'knight' && old.hero.look === 0);
  ok('an unknown class or look is made whole: the knight, a look inside the list', cleanHero({ id: 'paladin', look: 9 }).id === 'knight' && cleanHero({ id: 'druid', look: 9 }).look === 3 && cleanHero({ id: 'druid', look: -2 }).look === 0 && cleanHero(null).id === 'knight');
  ok('heroOf reads a profile whole', heroOf({ hero: { id: 'wizard', look: 1 } }).id === 'wizard' && heroOf({}).id === 'knight');
}

// the portrait follows the pick: the knight keeps cards.json player.art (the Art Lab's import path), the others their look
{
  fresh();
  ok('the knight\'s card draws cards.json player.art', portraitUrl('player') === `assets/chars/${DATA.cards.player.art}`);
  getProfile().hero = { id: 'necromancer', look: 2 };
  ok('another hero\'s card draws that hero\'s look', portraitUrl('player') === lookUrl(heroById('necromancer'), 2) && portraitUrl('player').startsWith('assets/heroes/'));
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { createRun } = await import('../../src/run/runState.js');
  const u = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  ok('the knight\'s card is named after the class', u.card.all((n) => n.className === 'card-name')[0].textContent === 'THE NECROMANCER');
  getProfile().hero = { id: 'knight', look: 0 };
}

// the screen
{
  fresh();
  show(heroScene());
  await sleep(1100);
  const cards = () => registry.app.all((n) => n.className.split(' ').includes('hero'));
  const chosen = () => cards().find((c) => c.classList.contains('chosen'))?.attrs['data-hero'];
  ok('CHOOSE YOUR HERO: five cards over the hall\'s painting, the saved hero chosen, Proceed the way on', t().includes('CHOOSE YOUR HERO') && cards().length === 5 && chosen() === 'knight'
    && /Proceed\s*\[space\]/.test(t()) && [registry.bg0, registry.bg1].some((l) => l.dataset.file === DATA.backgrounds.hub));
  handleKey('3');
  ok('3 chooses the third hero and the bar tells of it', chosen() === 'wizard' && t().includes('The Wizard') && t().includes('Old fire, older book'));
  cards().find((c) => c.attrs['data-hero'] === 'druid').listeners.click[0]();
  ok('a click chooses too', chosen() === 'druid');
  const switcher = () => registry.app.all((n) => n.className.split(' ').includes('looks'))[0];
  ok('the look switcher sits under the chosen card: four looks, the first on', switcher().parent === cards().find((c) => c.attrs['data-hero'] === 'druid') && switcher().textContent.includes('Look 1 of 4')
    && switcher().all((n) => n.tagName === 'i').length === 4 && !switcher().classList.contains('single'));
  handleKey('ArrowRight');
  ok('the right arrow turns the look', switcher().textContent.includes('Look 2 of 4') && switcher().all((n) => n.tagName === 'i' && n.classList.contains('on')).length === 1);
  handleKey('ArrowLeft'); handleKey('ArrowLeft');
  ok('the left arrow wraps round', switcher().textContent.includes('Look 4 of 4'));
  const figure = cards().find((c) => c.attrs['data-hero'] === 'druid').all((n) => n.className === 'figure')[0];
  ok('the figure draws that look', figure.attrs.src === lookUrl(heroById('druid'), 3));
  handleKey('1');
  ok('back to the knight, his own look kept (each hero remembers its look while the player compares)', chosen() === 'knight' && switcher().textContent.includes('Look 1 of 4') && (handleKey('5'), switcher().textContent.includes('Look 4 of 4')));
  ok('nothing is saved until Proceed', getProfile().hero.id === 'knight');
  handleKey(' ');
  await sleep(1300);
  ok('Proceed lands the pick on the profile and leads to the Great Hall', getProfile().hero.id === 'druid' && getProfile().hero.look === 3 && t().includes('GREAT HALL')
    && JSON.parse(localStorage.getItem('castle-roguelike-profile-v1')).hero.look === 3);
  ok('the hall names the class where the player has no name', (getProfile().name = '', show((await import('../../src/ui/scenes/index.js')).hubScene()), await sleep(1100), t().includes('The Druid')));
  getProfile().name = 'Tester';
}

// the way in, again: the saved pick is what the screen opens on
{
  fresh();
  getProfile().hero = { id: 'barbarian', look: 2 };
  show(titleScene());
  await sleep(1100);
  handleKey('e');
  await sleep(1300);
  const chosen = registry.app.all((n) => n.className.split(' ').includes('hero') && n.classList.contains('chosen'))[0];
  ok('Enter the Castle opens CHOOSE YOUR HERO on the saved hero and look', chosen?.attrs['data-hero'] === 'barbarian' && t().includes('Look 3 of 4'));
  resetProfile();
  ok('a progress wipe starts a fresh profile: the knight again (the name stays, the hero is a new game\'s choice)', getProfile().hero.id === 'knight');
}

// the source: the title leads here, the scene is registered, the phone has its twins
{
  const title = readFileSync('src/ui/scenes/titleScene.js', 'utf8'), css = readFileSync('styles.css', 'utf8');
  ok('the title\'s Enter the Castle goes to the hero screen, named or not', title.includes("getProfile().name ? go('hero') : namePrompt(() => go('hero'))"));
  ok('the hero screen has its phone twins and its rim breathes on opacity', css.includes('html.phone .hero-row {') && css.includes('html.phone .hero-detail {') && /@keyframes hero-rim \{[^}]*opacity/.test(css));
}
