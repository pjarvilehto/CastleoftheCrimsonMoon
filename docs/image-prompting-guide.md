# Image Prompting Guide — Dark Gothic Castle Game Art

A complete, reusable recipe for generating this project's art: backgrounds,
boss arenas, UI icons and character portraits, all in one consistent style.
Written so the prompts can be pasted into any capable image model
(Midjourney, DALL·E, Flux, Claude with an image tool, etc.).

---

## 1. The core style

Everything hangs on one style block. Keep it **word-for-word identical**
across the whole set — consistency comes from repetition, not luck.

### Background style block (the workhorse)

```
in the combined style of Darkest Dungeon 2 and Mike Mignola,
heavy black ink silhouettes, bold flat angular shapes,
rough hand-drawn ink texture and hatching,
dramatic chiaroscuro lighting,
video game background art, wide shot, no characters
```

### Why it works

- **"Darkest Dungeon 2 and Mike Mignola"** — naming both does the heavy
  lifting. One anchors the game-art rendering, the other the comic-ink look.
- **"heavy black ink silhouettes" + "chiaroscuro"** — reinforces the
  spot-black, high-contrast look so it doesn't drift painterly.
- **"video game background art, wide shot"** — sets framing and purpose.
- **"no characters"** — keeps backgrounds clean for gameplay overlays.

### Technical settings

- **Backgrounds:** 2048×1152 (16:9), PNG, opaque background
- **Portraits:** 1024×1536 (2:3), PNG, flat #c8c8c8 background
- **Icons:** 1024×1024, PNG, transparent background preferred

---

## 2. Background prompt structure

Every background prompt is three parts, in this order:

```
[SUBJECT: one vivid sentence with the color palette baked in],
[MOOD / COMPOSITION modifier if needed],
[STYLE BLOCK, always identical, always last]
```

### Example (complete prompt)

```
a long castle corridor lined with smoky torches, guttering flames barely
pushing back the darkness, tattered banners hanging from a vaulted ceiling,
wet flagstones reflecting dim amber light, vanishing into blackness,
gloomy and moody, in the combined style of Darkest Dungeon 2 and Mike
Mignola, heavy black ink silhouettes, bold flat angular shapes, rough
hand-drawn ink texture and hatching, dramatic chiaroscuro lighting, deep
shadows, oppressive atmosphere, video game background art, wide shot, no
characters
```

### Composition modifiers used

- Exteriors / hero shots: `wide establishing shot`
- Boss arenas: `video game boss arena background art, wide symmetrical
  battle stage composition with open floor space in the center`
- Moody pieces: `gloomy and moody, deep shadows, oppressive atmosphere`

### Palette discipline

State the palette **inside the subject sentence** — this is what gives each
image its own identity without breaking the shared style:

| Palette cue | Used for |
|---|---|
| amber torchlight / ember-orange | corridors, kitchens, war rooms |
| blood-red / crimson and gold | throne rooms, cathedrals, regalia |
| cold slate blue / moonlight | battlements, ruined halls, observatory |
| teal / abyssal green | cisterns, flooded vaults, drowned rooms |
| violet / magenta | arcane library, cursed reliquary, eclipse room |
| sepia / bone-white | ossuary, catacombs, bone passages |
| sickly green | sewers, smugglers' cache, thorn magic |
| pale spectral blue | frozen rooms, ice-locked treasure |

---

## 3. Every background prompt used

### Hero shot

```
a dark gothic medieval castle on a jagged cliff under a huge blood-red
moon, jagged spires and towers, bats circling, storm clouds, in the
combined style of Darkest Dungeon 2 and Mike Mignola, heavy black ink
silhouettes, bold flat angular shapes, rough hand-drawn ink texture and
hatching, dramatic chiaroscuro lighting, video game background art, wide
establishing shot, no characters
```

### Castle set (10)

```
1. castle entrance with a stone bridge over a misty chasm, raised iron
   portcullis, flaming torches on gatehouse towers, amber and cold blue
2. castle courtyard with a dead leafless tree, broken fountain, gargoyle
   statues, cold moonlight and fog
3. castle ramparts at night, crenellated walls, braziers, stormy sky
   with a pale moon, slate blue palette
4. castle chapel exterior, leaning gothic spire, shattered stained glass
   glowing from within, graveyard in front, violet dusk
5. great hall interior, long banquet table, massive fireplace, torn
   banners, candlelight amber against black shadows
6. castle library, towering bookshelves, rolling ladder, dust motes in
   candlelight, warm umber and ochre
7. castle dungeon, iron-barred cells, hanging chains, a single torch,
   rust-orange and black
8. throne room, towering throne on a dais, tattered crimson banners,
   beam of cold light from a high window, crimson and gold
9. chapel interior, rows of candles, broken pews, rose window glowing
   blood-red
10. alchemy laboratory, bubbling flasks, green glowing liquids, hanging
    herbs and cages, sickly green candlelight
```

### Outdoor shrines (3)

```
1. a mystical glowing shrine of floating crystals in a dark cavern, cyan
   crystal glow
2. a forest shrine of carved stone overgrown with roots, glowing amber
   runes, mist
3. a volcanic shrine of black obsidian, glowing magma cracks, ember-red
   glow
```

### Interior shrine rooms (3)

```
1. golden shrine room, a radiant golden altar with a floating relic,
   beams of warm light, gold and ivory
2. void shrine room, a black altar with a sphere of swirling void energy,
   violet glow, floating debris
3. frozen shrine room, an ice-encrusted altar with a glowing blue crystal
   heart, frost and icicles, pale spectral blue
```

### Boss arenas (6)

All used: `video game boss arena background art, wide symmetrical battle
stage composition with open floor space in the center`

```
1. ruined throne room arena, collapsed pillars, torn banners, moonlight
   shaft on the throne dais
2. void cathedral arena, floating broken platforms, swirling violet void
   sky beyond shattered walls
3. torture pit arena, iron cages, chains, braziers, rust and ember palette
4. storm battlements arena, lightning splitting the sky, rain, braziers
   fighting the wind, electric blue-white
5. frozen crypt arena, ice-covered sarcophagi, hanging icicles, pale blue
   glow
6. burning great hall arena, collapsing beams, roaring flames, orange-red
   inferno
```

### Dungeon set (20)

```
1. torch corridor — smoky torches, guttering flames, wet flagstones, amber
2. cathedral nave — crimson light through broken stained glass
3. arcane library — violet candlelight, floating books, glowing tomes
4. antechamber — cold waiting room, benches, dying hearth, grey-blue
5. royal bedroom — decayed four-poster bed, moth-eaten drapes, moonlight
6. servants' quarters — cramped bunks, single candle, drab brown
7. tomb vault — stone sarcophagi, cobwebs, cold green shaft of light
8. ossuary — walls of skulls and bones, chandeliers of bone, sepia
9. armory — weapon racks, rusted armor stands, dull steel and amber
10. war room — campaign table with maps, candles, crimson drapes
11. wine cellar — barrel rows, cobwebs, green-amber lantern light
12. kitchen — cold hearth, hanging pots, butcher block, grey morning gloom
13. bell tower interior — massive bronze bell, ropes, beams, moonlight slits
14. observatory — broken telescope, star charts, open dome, cold starlight
15. prison corridor — cell doors, shackles, flickering torch, rust-orange
16. cistern — still black water, columns, dripping, deep teal
17. sewer passage — flowing channel, slime, phosphorescent green
18. portrait gallery — rows of dark oil portraits, one fallen, candlelight
19. treasury — empty plundered shelves, scattered coins, dust, gold-grey
20. conservatory — dead plants, broken glass roof, pale moonlight
```

### Treasure rooms (6)

```
1. dragon hoard — mountains of gold coins in a cavern, scorched claw
   marks, orange-red
2. sunken vault — half-flooded treasury, barnacled pillars, teal water
3. cursed reliquary — glowing idols, chained grimoires, bone relics,
   violet-magenta
4. regalia chamber — crowns and scepters on crimson velvet, ceremonial
   gold armor, candlelight
5. frozen tribute — treasures encased in jagged ice, pale spectral blue
6. smugglers' cache — contraband crates and barrels, green lantern light
```

### Throne rooms (5 variants)

```
1. obsidian sovereign — black volcanic glass throne, mirror floor,
   cold blue-silver
2. rose queen — ruined throne in rotting rose tapestries, ghost-roses,
   dusty rose-pink light
3. drowned king — black coral throne in ankle-deep seawater, anglerfish
   lanterns, abyssal teal
4. ember warlord — throne of fused swords in a forge-hall, lava channels,
   red-orange
5. thorn regent — throne consumed by giant black thorns, green witchfire
   braziers
```

### Corridors & walkways (10)

```
1. torch hall — long corridor, guttering torches, tattered banners,
   amber into black
2. collapsed gallery — broken beams, moonlight through shattered roof,
   cold blue shafts
3. cavern chasm — narrow walkway over bottomless abyss, glowing
   blue-green fungi
4. sewer aqueduct — ledge beside black water channel, mossy arches,
   sickly green
5. fog bridge — crumbling bridge over fog-swallowed hall, gargoyles,
   near monochrome
6. spiral stair — tower stairwell descending into darkness, red glow
   from below
7. bone passage — catacomb walls of stacked skulls, floor fog, sepia
8. flooded hall — drowned colonnade, fallen chandeliers in black water,
   teal-grey
9. crypt walkway — elevated ledge above sarcophagi, candle niches,
   violet-grey
10. gothic vault — ribbed corridor open to lightning storm, rain through
    broken glass, purple and slate
```

### Antechambers (5, pre-boss rooms)

```
1. iron gate — massive riveted gate, light through seams, broken weapons
   of fallen challengers, braziers
2. crimson veil — velvet-draped ruin, black candles, cracked mirrors,
   door veiled in red silk
3. bone threshold — skull walls, offering altar, chained door leaking
   green light
4. drowned vestry — flooded chapel, water pouring through boss doorway,
   drifting candles
5. eclipse portal — black sun sigil on floor, violet witchfire, door
   crowned with broken iron halo
```

---

## 4. UI icons (Diablo II style)

### Icon style block

```
hand-painted game UI icon in the style of Diablo II inventory icons,
painterly oil-paint texture with visible brush strokes, dark fantasy,
rich golden and amber tones with deep shadows, dramatic warm rim
lighting, single centered object, isolated game icon, no text, no border
```

Structure: `[one-line object description], [icon style block]`.
Size 1024×1024, transparent background. Note: some generations come back
with a painted dark aura instead of full transparency — fine on dark UI,
worth checking the alpha channel if you need clean cutouts.

### Icon subjects used

```
dmg:           two crossed medieval arming swords, notched bloodied steel
crit:          a sharp five-pointed golden starburst, faceted metal edges
armor:         a gothic kite shield of dark steel with a golden boss
armor (alt):   a heavy crimson tower shield, riveted black-iron frame
leech:         a glossy crimson blood drop, jewel-like, gold glow beneath
bulwark:       a tower shield of blackened iron, radiant gold cross emblem
secondwind:    a radiant golden cross glowing with holy light
quicken:       a jagged golden lightning bolt, white-hot edges
greed:         a faceted golden diamond, brilliant cut, warm inner glow
glasscannon:   a crystalline longsword, cracks glowing orange from within
iron coffer:   a stout iron coffer chest, riveted bands, spilling coins
gilded chest:  an ornate gilded chest, gold filigree and rubies
reliquary:     a sealed golden reliquary amphora, wax seal and chain
```

---

## 5. Character portraits

Two-reference method: **image 1** = the character's existing portrait
(identity, pose), **image 2** = a room painting (style source). Size
1024×1536, flat #c8c8c8 background for clean cut-out.

### Portrait style block

```
Redraw the character from the first reference image in the exact art
style of the second reference image.

STYLE: Mike Mignola meets Darkest Dungeon 2. Hand-painted dark gothic
comic illustration. Heavy black ink shapes and spot blacks, bold chunky
silhouette, thick confident ink outlines, flat graphic shadows with very
few midtones, rough dry-brush and crosshatch texture, matte finish.
Muted, desaturated palette: umber, ochre, tarnished gold, cold slate
blue-grey, with oxblood red as the accent. Glows only where the character
has them, small and crisp, never bloom. One dramatic light source from
the upper left with a thin rim light on the right edge.

COMPOSITION: one character only, full body from head to toe, nothing
cropped, centred with a small margin. Three-quarter view, [FACING].
Plain flat light grey background (#c8c8c8), completely empty: no floor,
no ground shadow, no scenery, no frame, no text, no watermark.

KEEP from the first reference image: the character's identity,
silhouette, pose, proportions, colour accents and glowing details.

AVOID: photorealism, 3D render, glossy plastic look, soft airbrush
gradients, lens blur, bloom, neon colours, busy detail that turns to
mush at small size.
```

`[FACING]`: **facing right** for the hero, **facing left** for every enemy.
Then append the character's one-line description (`CHARACTER: ...`).

### Menacing variant trick (boss)

To push a more threatening pose, keep the whole block identical and only
extend the character line, e.g.:

```
... Now in a menacing, threatening attack pose: lunging forward
aggressively, cloak billowing wide like bat wings, golden sword raised
high and swept back ready to strike, fanged skull-face snarling,
glowing eyes, a predatory hunch to the shoulders. Facing left.
```

---

## 6. Practical tips

1. **Keep the style block verbatim** across every image in a set. Change
   only the subject sentence and palette.
2. **Name the palette in the subject**, not the style block.
3. **Generate 2–4 variants** per subject and keep the best — variance is
   free, rerolls are cheap.
4. **Too clean or 3D?** Add: `flat inked comic look, like a Hellboy
   panel, no rendering`.
5. **Too busy at small size?** Add: `simple big shapes, readable at a
   small size`.
6. **Background not flat?** Repeat: `plain empty light grey background`.
7. **Batch by theme** (e.g. all corridors together) so you can spot style
   drift immediately.
8. If a model can't take reference images, lean harder on the written
   description — identity details (silhouette, glows, accent color) matter
   more than rendering words.
