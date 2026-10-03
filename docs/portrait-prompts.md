# Portrait prompts for Kimi: knight and enemies in the room style

Goal: redraw the 13 character portraits (the knight and 12 enemies) in the
style of the room paintings, "Mike Mignola meets Darkest Dungeon 2", keeping
each character's identity, pose and colour accent so the game's animations
and hit effects still fit.

## How to use

1. Attach **two reference images** to each request:
   - **Image 1:** the character's current portrait from `assets/chars/`, for
     the design and pose.
   - **Image 2:** the style reference. Since the painterly direction
     (0.00201) it is the best ORIGINAL portrait of the same colour family:
     `blood_knight.webp` for the fire and crimson creatures,
     `skeleton.webp` for the cold undead and stone, `vampire_lord.webp`
     for the boss, a character's own portrait otherwise
     (`tools/gen-art.mjs STYLE_REF`; `--refs sheets` goes back to the
     owner's inked sheets in `assets/style/`, `--style` to any picture).
2. Paste the **style block** below, then that character's **character
   line**.
3. Ask for a **2:3 portrait** (vertical). Generate 2–4 variants and keep the
   best.
4. Start with the pilot of three: **the Curious Knight, the Giant Rat and the
   Vampire Lord**. Once those look right in the game, do the rest with the
   same wording.

## Style block (the same for every character)

```
Redraw the character from image 1 in the exact rendering style of image 2.

STYLE: painterly dark-fantasy concept art, cinematic. Smooth tonal
shading, deep blacks and high contrast, crisp specular highlights on
metal and bone, fine texture (chainmail links, cracked bone, embroidery),
semi-realistic proportions. No ink outlines, no flat cel shading, no
crosshatch, no comic look. The character's own glow lights it from
within: emissive cracks, runes, eyes and blades burn bright and
saturated and light the figure around them, with a tight bloom and a few
drifting sparks — never a soft haze, never dim.

COLOUR: one hue family per character against black — fire creatures
orange-red, the undead cold cyan-blue, blood crimson, the boss gold and
ember, stone grey-blue. Saturation lives in the glow; everything else is
dark and desaturated.

COMPOSITION: one character only, full body from head to toe, nothing
cropped, large in the frame with only a small margin, in a dynamic
menacing stance. Three-quarter view, [FACING]. Plain flat mid-grey
background (#8a8a8a), completely empty: no floor, no ground shadow, no
scenery, no frame, no text, no watermark, and no glow or bloom spilling
beyond the figure's silhouette.

KEEP from image 1: the character's identity, silhouette, pose,
proportions, colour accents and glowing details.

AVOID: comic ink lines, flat graphic shapes, dry-brush paper texture,
a photograph of a real person, washed-out greys, neon, a small or timid
figure.
```

Set `[FACING]` to **facing left** for every enemy (they face the knight),
and **facing right** for the knight.

The gargoyle's current art comes from another source and is not a
reference: it is drawn from its line alone, from another character's
picture (`node tools/gen-art.mjs --only gargoyle --from-sheet skeleton`:
the one-picture Kontext replaces that picture's figure with the
gargoyle; the skeleton's original, or its inked sheet with `--refs sheets`).

## Character lines (paste after the style block)

| Character | File | Character line |
|---|---|---|
| The Curious Knight | `player.webp` | `CHARACTER: a young dark-haired knight with no helmet, worn leather and chainmail, a long straight sword held low in a lunging fighting stance. Facing right. ACCENT: warm leather browns and dull steel, a dark red scarf; no glow.` |
| Giant Rat | `rat.webp` | `CHARACTER: a huge hunched black sewer rat, matted fur, pink ears and scaly tail, small glowing pale eyes, bared yellow fangs, clawed forepaws. ACCENT: black fur, pink ears and tail, small pale glowing eyes.` |
| Cave Shrieker | `cave_shrieker.webp` | `CHARACTER: an emaciated bat-like cave horror with wet blue-black skin, long spindly clawed limbs, torn wing membranes and a gaping fanged maw, hunched forward. ACCENT: wet blue-black skin with cold blue highlights, pale glowing eyes.` |
| Skeleton | `skeleton.webp` | `CHARACTER: a skeleton warrior in rusted scraps of armour and rags, small glowing eyes, holding a notched sword whose blade glows a faint cold blue. ACCENT: cold blue-grey bone and rusted iron; the blade glows a bright cold blue.` |
| Cinderborn | `ghoul.webp` | `CHARACTER: a tall hooded figure in a charred robe, a burning ember heart in its chest, glowing orange cracks in the cloth and embers drifting off it. ACCENT: charred black cloth split by bright orange-red ember cracks, the heart a blaze of fire, embers drifting off it.` |
| Cult Acolyte | `cultist.webp` | `CHARACTER: a hooded cultist in heavy black robes with a leather belt and sash, a blank mask with two glowing orange eye slits, a curved dagger in one hand. ACCENT: black robes; the two eye slits glow bright orange.` |
| Fellblade | `golem.webp` | `CHARACTER: a hulking shaggy brute with glowing red eyes, dragging a huge rusted greatsword, a faint red haze around its lower body. ACCENT: black shaggy hide, bright red glowing eyes, a crimson haze about its feet.` |
| Wraith | `wraith.webp` | `CHARACTER: a floating hooded spectre with a skull face, a tattered shroud that dissolves into mist at the bottom, long bony hands. Cold, ghostly, no feet. ACCENT: cold blue-grey shroud and pale bone, a dim red sigil on the chest, cold blue mist at the hem.` |
| Gargoyle | `gargoyle.webp` | `CHARACTER: a crouching stone gargoyle of pale cracked stone, curved horns, a snarling fanged face, folded bat wings, clawed feet. ACCENT: pale grey-blue cracked stone, dark hollows; no glow.` |
| Vampire Lord (boss) | `vampire_lord.webp` | `CHARACTER: the Vampire Lord, a tall gaunt lord with a skull-like face in a long dark high-collared cloak, holding a curved golden sword. Regal and terrifying, the boss. BOSS: he towers over the frame, ornate and heavy with gold, the sword sweeping across the full width of the picture, embers in the air; wide format. ACCENT: black cloak with gold trim and a high collar, the golden sword glowing warm, ember-orange eyes; regal, not ragged.` |
| Crypt Spider | `crypt_spider.webp` | `CHARACTER: a giant spider with a black spiked carapace, glowing red eyes and a glowing red rune on its back, long jagged legs. ACCENT: black spiked carapace; the eyes and the rune on its back blaze bright red.` |
| Hollow Hound | `hollow_hound.webp` | `CHARACTER: a skeletal hellhound with dark cracked hide, glowing red cracks and a burning red core in its chest, bared fangs. ACCENT: black cracked hide split by burning red cracks, the core in its chest a bright red blaze.` |
| Blood Knight | `blood_knight.webp` | `CHARACTER: a knight in jagged crimson armour and a hood, a glowing red sigil on the chest, holding a long blood-red sword point down. ACCENT: crimson armour; the sword and the chest sigil burn bright red.` |

## Tips

- **Too clean or too 3D?** Add: `flat inked comic look, like a Hellboy
  panel, no rendering`.
- **Too busy at card size?** Add: `simple big shapes, readable at a small
  size`.
- **Background not flat?** Repeat: `plain empty light grey background`. A
  flat background is what lets the figure be cut out cleanly.
- Keep the wording identical between characters, so the set stays
  consistent.

When the images are ready, upload them to GitHub (or the chat) named by
the file column, e.g. `rat.png`. The import trims and cuts out each one,
and it goes into the game under a new file name.
