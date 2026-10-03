// tools/test/heroes.test.mjs — the character classes (0.00248): heroes.json
// and shared/heroes.js, the pick on the profile (save version 6, an
// imported code made whole), CHOOSE YOUR HERO between the title and the
// hall (1-7 and a click choose, the arrows turn the look, Proceed lands the
// pick and leads on), and the knight's card and the hall drawing the hero.

import { ok, sleep, t, fresh, registry, El, DATA, show, handleKey, heroScene, titleScene, resetProfile, getProfile, readFileSync, statSync } from './harness.mjs';

const { heroList, heroById, defaultHero, cleanHero, heroOf, lookUrl, lookOf, heroArtUrls, heroFirstUrls, HERO_DIR } = await import('../../src/shared/heroes.js');
const { portraitUrl } = await import('../../src/shared/portraits.js');
const { SAVE_VERSION, migrateProfile } = await import('../../src/meta/migrations.js');
const { checkData } = await import('../../src/shared/dataCheck.js');

// the data
{
  fresh();
  const ids = heroList().map((h) => h.id);
  ok('seven heroes, the knight the default', ids.join() === 'knight,barbarian,wizard,necromancer,druid,hexhunter,plaguesister' && defaultHero().id === 'knight');
  ok('every look of every hero is a file on disk: the knight\'s five (0.00264: four standing + the old crouch), the others their sheets (39 figures)', heroList().every((h) => h.looks.length >= 1 && h.looks.every((l) => statSync(`${HERO_DIR}/${l.art}`).isFile() && l.fh > 0.7 && l.fh < 1))
    && heroArtUrls().length === 39 && heroById('knight').looks.length === 5 && heroById('wizard').looks.length === 8);
  const { essentialUrls, restUrls, roomUrls } = await import('../../src/shared/preload.js');
  getProfile().hero = { id: 'wizard', look: 3 };
  ok('the preloader fetches the figures the screen opens on first among the essentials (every first look and the profile\'s own), the other looks behind', essentialUrls().slice(0, 7).join() === heroFirstUrls(getProfile()).join()
    && essentialUrls()[2] === lookUrl(heroById('wizard'), 3) && heroArtUrls().every((u) => restUrls().includes(u)) && new Set(restUrls()).size === restUrls().length && restUrls().indexOf(lookUrl(heroById('wizard'), 1)) < restUrls().indexOf(roomUrls()[0]));
  getProfile().hero = { id: 'knight', look: 0 };
  const broken = structuredClone(DATA); broken.heroes = { default: 'paladin', heroes: [{ id: 'x', name: 'X', looks: [{ art: 'x.webp', fh: 2 }], traits: 'no' }] };
  const probs = checkData(broken);
  ok('data check: a hero needs whole looks (art and a share), lines, and the default must exist', ['looks', 'epithet', 'default (paladin)'].every((m) => probs.some((p) => p.includes(m))), probs.join('; '));
}

// the profile: the pick, the migration, an imported code
{
  fresh();
  ok('a fresh profile has no hero yet (chosen once, on CHOOSE YOUR HERO), at save version 6', SAVE_VERSION === 6 && getProfile().saveVersion === 6 && getProfile().hero === null);
  const old = { saveVersion: 4, stats: {}, alchemy: {}, records: {}, name: 'Old', coins: 1, xp: 1, potions: 2, potionCap: 4, equipment: null };
  migrateProfile(old, (await import('../../src/meta/profile.js')).DEFAULTS ?? { coins: 0, xp: 0, potions: 2, potionCap: 4, potionsBought: 0, stats: {}, alchemy: {}, records: {} });
  ok('a v4 save ends at v6 with no hero: it chooses once (the v5 step gave the knight unasked, the v6 step took it back)', old.saveVersion === 6 && old.hero === null);
  ok('an unknown class or look is made whole: the knight, a look inside the list', cleanHero({ id: 'paladin', look: 9 }).id === 'knight' && cleanHero({ id: 'druid', look: 9 }).look === 4 && cleanHero({ id: 'druid', look: -2 }).look === 0 && cleanHero(null).id === 'knight');
  ok('heroOf reads a profile whole', heroOf({ hero: { id: 'wizard', look: 1 } }).id === 'wizard' && heroOf({}).id === 'knight');
}

// the portrait follows the pick: the knight keeps cards.json player.art (the Art Lab's import path), the others their look
{
  fresh();
  const knight = heroById('knight'), crouch = knight.looks.findIndex((l) => l.sprite);
  ok('the knight\'s card draws his standing look (an unchosen save is the knight\'s too); only his crouching look keeps cards.json player.art (0.00264)', portraitUrl('player') === lookUrl(knight, 0)
    && (getProfile().hero = { id: 'knight', look: 2 }, portraitUrl('player') === lookUrl(knight, 2))
    && crouch === 4 && (getProfile().hero = { id: 'knight', look: crouch }, portraitUrl('player') === `assets/chars/${DATA.cards.player.art}`));
  {
    const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
    const { createRun } = await import('../../src/run/runState.js');
    getProfile().hero = { id: 'knight', look: 1 };
    const standing = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} }).card.classList.contains('hero-standing');
    getProfile().hero = { id: 'knight', look: crouch };
    const wide = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} }).card.classList.contains('hero-standing');
    ok('...his card stands like the other classes\', but for the crouch (the wide sprite)', standing && !wide);
  }
  getProfile().hero = { id: 'necromancer', look: 2 };
  ok('another hero\'s card draws that hero\'s look', portraitUrl('player') === lookUrl(heroById('necromancer'), 2) && portraitUrl('player').startsWith('assets/heroes/'));
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { createRun } = await import('../../src/run/runState.js');
  const u = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  ok('the knight\'s card is named after the class, above the card (0.00251)', u.el.all((n) => n.className === 'hero-title card-name')[0].textContent === 'THE NECROMANCER' && !u.card.all((n) => n.className.includes('card-name')).length
    && u.card.all((n) => n.className === 'gear-vals')[0].textContent.includes('LV1'));
  // the heavy's name per class (0.00267, the developer's picks)
  const heavyLabel = (unit) => unit.el.all((n) => n.className === 'btn-label')[0].textContent.replace(/\s*\(\d+\)$/, '');
  ok('the heavy button carries the class\'s own name (the Necromancer: Soul Drain), on the H key still', heavyLabel(u) === 'Soul Drain' && u.el.all((n) => n.tagName === 'button')[0].attrs['data-key'] === 'h'
    && u.card.all((n) => n.className === 'back-row').some((r) => r.textContent.startsWith('Soul Drain')));
  getProfile().hero = { id: 'knight', look: 0 };
  ok('the knight keeps Heavy Attack', heavyLabel(createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} })) === 'Heavy Attack');
  getProfile().hero = null;
  ok('every hero names its heavy (heroes.json heavyName, checked at load)', heroList().every((h) => typeof h.heavyName === 'string' && h.heavyName.trim())
    && checkData({ ...DATA, heroes: { ...DATA.heroes, heroes: DATA.heroes.heroes.map((h) => (h.id === 'druid' ? { ...h, heavyName: '' } : h)) } }).some((m) => m.includes('druid.heavyName')));
}

// the screen
{
  fresh();
  show(heroScene());
  await sleep(1100);
  const cards = () => registry.app.all((n) => n.className.split(' ').includes('hero'));
  const chosen = () => cards().find((c) => c.classList.contains('chosen'))?.attrs['data-hero'];
  ok('CHOOSE YOUR HERO: seven cards over the hall\'s painting, the saved hero chosen, Proceed the way on', t().includes('CHOOSE YOUR HERO') && cards().length === 7 && chosen() === 'knight'
    && /Proceed\s*\[space\]/.test(t()) && [registry.bg0, registry.bg1].some((l) => l.dataset.file === DATA.backgrounds.hub));
  handleKey('3');
  ok('3 chooses the third hero and the bar tells of it', chosen() === 'wizard' && t().includes('The Wizard') && t().includes('Old fire, older book'));
  cards().find((c) => c.attrs['data-hero'] === 'druid').listeners.click[0]();
  ok('a click chooses too', chosen() === 'druid');
  const switcher = () => registry.app.all((n) => n.className.split(' ').includes('looks'))[0];
  ok('the look switcher sits under the chosen card: the druid\'s five looks, the first on', switcher().parent === cards().find((c) => c.attrs['data-hero'] === 'druid') && switcher().textContent.includes('Look 1 of 5')
    && switcher().all((n) => n.tagName === 'i').length === 5 && !switcher().classList.contains('single'));
  handleKey('ArrowRight');
  ok('the right arrow turns the look', switcher().textContent.includes('Look 2 of 5') && switcher().all((n) => n.tagName === 'i' && n.classList.contains('on')).length === 1);
  handleKey('ArrowLeft'); handleKey('ArrowLeft');
  ok('the left arrow wraps round', switcher().textContent.includes('Look 5 of 5'));
  const figure = cards().find((c) => c.attrs['data-hero'] === 'druid').all((n) => n.className === 'figure')[0];
  ok('the figure draws that look, at its own sheet share', figure.attrs.src === lookUrl(heroById('druid'), 4) && figure.attrs.style === `--fh:${lookOf(heroById('druid'), 4).fh}`);
  handleKey('1');
  ok('back to the knight, his five looks (0.00264); the druid\'s own look is kept (each hero remembers its look while the player compares)', chosen() === 'knight' && !switcher().classList.contains('single') && switcher().textContent.includes('Look 1 of 5') && (handleKey('5'), switcher().textContent.includes('Look 5 of 5') && !switcher().classList.contains('single')));
  ok('nothing is saved until Proceed', getProfile().hero === null);
  handleKey(' ');
  await sleep(1300);
  ok('Proceed lands the pick on the profile and leads to the Great Hall', getProfile().hero.id === 'druid' && getProfile().hero.look === 4 && t().includes('GREAT HALL')
    && JSON.parse(localStorage.getItem('castle-roguelike-profile-v1')).hero.look === 4);
  ok('...and a new save puts on the class\'s starting kit (0.00265): the druid\'s branch and bark vest', getProfile().equipment.weapon === 'budding_branch' && getProfile().equipment.armor === 'bark_vest');
  ok('the hall names the class where the player has no name', (getProfile().name = '', show((await import('../../src/ui/scenes/index.js')).hubScene()), await sleep(1100), t().includes('The Druid')));
  getProfile().name = 'Tester';
}

// the way in, again: the saved pick is what the screen opens on
{
  fresh();
  getProfile().hero = { id: 'barbarian', look: 2 };
  show(heroScene());
  await sleep(1100);
  const chosen = registry.app.all((n) => n.className.split(' ').includes('hero') && n.classList.contains('chosen'))[0];
  ok('reached with a pick already made (?debug), the screen opens on that hero and look', chosen?.attrs['data-hero'] === 'barbarian' && t().includes('Look 3 of 5'));
  resetProfile();
  ok('a progress wipe starts a fresh profile: no hero (the name stays, the hero is a new game\'s choice)', getProfile().hero === null);
}

// the source: the title leads here, the scene is registered, the phone has its twins
{
  const title = readFileSync('src/ui/scenes/titleScene.js', 'utf8'), css = readFileSync('styles.css', 'utf8');
  ok('the title\'s Enter the Castle goes to the hero screen only until a hero is chosen, named or not', title.includes("go(getProfile().hero ? 'hub' : 'hero')") && title.includes('getProfile().name ? wayIn() : namePrompt(wayIn)'));
  ok('the hero screen has its phone twins and its rim breathes on opacity', css.includes('html.phone .hero-row {') && css.includes('html.phone .hero-detail {') && /@keyframes hero-rim \{[^}]*opacity/.test(css));
}

// 0.00253 (the developer's call): the class is chosen ONCE per save — a new
// game chooses, a save that has goes straight to the hall; the look alone
// can change later, from the hall's portrait (the phone's Equipment sheet
// has a Look row); the pick and the look go to the stats.
{
  fresh();
  const { migrateProfile: migrate, SAVE_VERSION: V } = await import('../../src/meta/migrations.js');
  const { DEFAULTS } = await import('../../src/meta/profile.js').then((m) => ({ DEFAULTS: { coins: 0, xp: 0, potions: 2, potionCap: 4, potionsBought: 0, stats: {}, alchemy: {}, records: {} } }));
  ok('a fresh profile has no hero yet, at save version 6', V === 6 && getProfile().hero === null && heroOf(getProfile()).id === 'knight');
  const v5 = { saveVersion: 5, stats: {}, alchemy: {}, records: {}, name: 'Old', coins: 1, xp: 1, potions: 2, potionCap: 4, equipment: null, hero: { id: 'knight', look: 0 } };
  migrate(v5, DEFAULTS);
  ok('a v5 save (the knight given unasked) chooses once more: hero null at v6', v5.saveVersion === 6 && v5.hero === null);
  const chosen = { saveVersion: 6, stats: {}, alchemy: {}, records: {}, name: 'N', coins: 0, xp: 0, potions: 2, potionCap: 4, equipment: null, hero: { id: 'druid', look: 9 } };
  migrate(chosen, DEFAULTS);
  ok('a chosen hero survives a load, made whole', chosen.hero.id === 'druid' && chosen.hero.look === 4);
  // the way in
  show(titleScene()); await sleep(1100);
  handleKey('e'); await sleep(1300);
  ok('a new game: Enter the Castle opens CHOOSE YOUR HERO', t().includes('CHOOSE YOUR HERO'));
  handleKey('4'); handleKey(' '); await sleep(1300);
  ok('Proceed lands the pick and enters the hall', getProfile().hero?.id === 'necromancer' && t().includes('GREAT HALL'));
  show(titleScene()); await sleep(1100);
  handleKey('e'); await sleep(1300);
  ok('a save that has chosen: Enter the Castle goes straight to the Great Hall', t().includes('GREAT HALL') && !t().includes('CHOOSE YOUR HERO'));
  // the hall's portrait: the look picker
  const realBody = globalThis.document.body;
  const body = new El('body');
  globalThis.document.body = body;
  const dialog = () => body.children.find((c) => c.className?.includes('update-overlay'));
  const card = () => registry.app.all((n) => n.className.split(' ').includes('knight-card'))[0];
  ok('the hall\'s portrait is pickable and says which look', card().classList.contains('pickable') && card().textContent.includes('Look 1 of 8'));
  card().listeners.click[0]();
  const d = dialog();
  ok('a click opens the look picker on the hero', !!d && d.textContent.includes('The Necromancer') && d.textContent.includes('Look 1 of 8') && d.textContent.includes('a new game chooses again'));
  handleKey('ArrowRight'); handleKey('ArrowRight');
  ok('the arrows turn the look and save it at once', dialog().textContent.includes('Look 3 of 8') && getProfile().hero.look === 2 && JSON.parse(localStorage.getItem('castle-roguelike-profile-v1')).hero.look === 2);
  handleKey('ArrowLeft'); handleKey('ArrowLeft'); handleKey('ArrowLeft');
  ok('…and wrap round', dialog().textContent.includes('Look 8 of 8') && getProfile().hero.look === 7);
  handleKey(' ');
  await sleep(50);
  ok('Space (Done) closes it and the hall shows the new look', !dialog() && card().textContent.includes('Look 8 of 8'));
  ok('the hall\'s hotkeys were held while it was open', t().includes('GREAT HALL'));
  // a hero with one look (none since the knight's standing sheets, 0.00264 — the data trimmed for the check): nothing to pick
  const knightLooks = heroById('knight').looks;
  heroById('knight').looks = [knightLooks[0]];
  getProfile().hero = { id: 'knight', look: 0 };
  show((await import('../../src/ui/scenes/index.js')).hubScene()); await sleep(1100);
  ok('a hero with one look: the portrait is not pickable and names the class', !card().classList.contains('pickable') && !card().listeners.click && card().textContent.includes('The Curious Knight'));
  heroById('knight').looks = knightLooks;
  globalThis.document.body = realBody;
  // the stats
  const { runRecord } = await import('../../src/meta/history.js');
  const { statsPayload } = await import('../../src/meta/telemetry.js');
  const { createRun } = await import('../../src/run/runState.js');
  getProfile().hero = { id: 'druid', look: 3 };
  const rec = runRecord(createRun(), 'death', 1, { id: 'druid', look: 3 });
  ok('a run record carries who played and their look; the upload carries the pick', rec.hero === 'druid' && rec.look === 3 && runRecord(createRun(), 'death').hero === null
    && statsPayload(getProfile(), null).profile.hero.id === 'druid' && statsPayload(getProfile(), null).profile.hero.look === 3);
  const wk = await import('../../collector/worker.js');
  const st = await import('../../analytics/stats.js');
  ok('the collector and the dashboard keep the hero on the run and on the profile, typed and capped', wk.cleanRun({ at: 1, room: 2, hero: 'druid', look: 3 }).hero === 'druid' && wk.cleanRun({ at: 1, room: 2, hero: 'druid', look: 3 }).look === 3
    && wk.cleanRun({ at: 1, room: 2, hero: 'x'.repeat(40), look: 500 }).hero.length === 24 && wk.cleanRun({ at: 1, room: 2, hero: 'x'.repeat(40), look: 500 }).look === 99
    && wk.cleanProfile({ hero: { id: 'wizard', look: 1 } }, 'p').hero.id === 'wizard' && wk.cleanProfile({ hero: 'junk' }, 'p').hero === null
    && st.sanitizeProfile({ hero: { id: 'wizard', look: 2 }, history: [{ at: 1, hero: 'wizard', look: 2 }] }).hero.look === 2 && st.sanitizeProfile({ hero: { id: 'wizard', look: 2 }, history: [{ at: 1, hero: 'wizard', look: 2 }] }).history[0].hero === 'wizard'
    && st.sanitizeProfile({}).hero === null);
  const rows = st.byHero([{ hero: 'wizard', look: 0, room: 4, outcome: 'death' }, { hero: 'wizard', look: 2, room: 6, outcome: 'retreat' }, { room: 2, outcome: 'death' }]);
  ok('By hero: runs grouped by class (a run before the classes is the knight\'s), the looks worn counted', rows.length === 2 && rows[0].hero === 'wizard' && rows[0].runs === 2 && rows[0].looks === 2 && rows[1].hero === 'knight' && rows[1].runs === 1);
  ok('the collector to paste carries the hero fields', readFileSync('collector/worker.js', 'utf8').includes("export const VERSION = '0.00253'") && DATA.telemetry.collectorVersion === '0.00253');
}

// 0.00254: a colour theme per class — the plate's colour on the hero screen, in combat and in the hall, the card light's look and tint behind the player
{
  fresh();
  const { cardStyle, LOOKS } = await import('../../src/ui/cardFx.js');
  ok('every hero has a theme: a plate colour, a light the shader knows, a tint', heroList().every((h) => /^#[0-9a-f]{6}$/i.test(h.theme.plate) && LOOKS.includes(h.theme.light) && h.theme.tint.length === 3)
    && new Set(heroList().map((h) => h.theme.plate)).size === 7);
  const broken = structuredClone(DATA); broken.heroes.heroes[1].theme = { plate: 'red', light: 'sparks', tint: [1] };
  ok('data check: a theme must be whole', checkData(broken).some((p) => p.includes('barbarian.theme')));
  getProfile().hero = { id: 'knight', look: 0 };
  const k = cardStyle('player');
  getProfile().hero = { id: 'barbarian', look: 0 };
  const b = cardStyle('player');
  ok('the card light behind the player follows the class: the knight\'s ether, the barbarian\'s embers', k.look === 'ether' && b.look === 'embers' && b.tint[0] === 0.95);
  const { createPlayerUnit } = await import('../../src/ui/battleLine.js');
  const { createRun } = await import('../../src/run/runState.js');
  const u = createPlayerUnit(createRun(), { onHeavy() {}, onPotion() {} });
  const frame = u.card.all((n) => n.className === 'card-frame')[0];
  ok('the knight\'s card plate carries the class colour as a blend layer', frame.attrs.style === '--theme:#9e3e1a' && frame.children.some((c) => c.className === 'tone'));
  show(heroScene()); await sleep(1100);
  const cards = registry.app.all((n) => n.className.split(' ').includes('hero'));
  ok('every card on CHOOSE YOUR HERO wears its class colour', cards.length === 7 && cards.every((c) => c.attrs.style === `--theme:${heroById(c.attrs['data-hero']).theme.plate}` && c.all((n) => n.className === 'tone').length === 1));
  getProfile().hero = null;
}
