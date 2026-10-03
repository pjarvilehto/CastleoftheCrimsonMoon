# Portrait prompts: the knight and enemies

Goal: redraw the 13 character portraits (the knight and 12 enemies) in
their own rendering — photoreal dark fantasy, the character's glow
lighting it, one hue family each (0.00201: the inked room style was tried
and dropped) — complete, consistent and cut out cleanly, keeping each
character's identity, pose and colour accent so the game's animations and
hit effects still fit.

## How it is used

1. Attach **two reference images** to each request:
   - **Image 1:** the character's current portrait from `assets/chars/`, for
     the design and pose.
   - **Image 2:** the style reference. Since the painterly direction
     (0.00201) it is the character's OWN current portrait — its rendering
     is the destination, and another character's picture bleeds its
     design in. A character whose portrait is no reference (the gargoyle)
     is drawn onto the best original of its colour family instead
     (`--from-sheet skeleton`; `tools/gen-art.mjs STYLE_REF`, `--refs
     family`); `--refs sheets` uses the developer's inked sheets in
     `assets/style/`, `--style` any picture.
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

STYLE: photoreal dark-fantasy character render, Unreal Engine 5
cinematic quality. Physically based materials — worn metal with real
specular highlights and micro-scratches, cloth with weave and fraying,
bone and skin with subsurface scattering, wet surfaces that reflect.
Ray-traced lighting, volumetric light in the air, deep blacks and high
contrast, fine 8k detail. No painterly brushwork, no ink outlines, no
flat shading, no comic look. The character's own glow lights it: emissive
cracks, runes, eyes and blades burn bright and saturated and cast real
light on the surfaces around them, with a tight bloom and a few drifting
sparks — never a soft haze, never dim.

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

AVOID: painterly or comic rendering, ink lines, flat shapes, washed-out
greys, neon, a small or timid figure, a recognisable real person's face.
```

Set `[FACING]` to **facing left** for every enemy (they face the knight),
and **facing right** for the knight.

**Bosses** get their own COMPOSITION paragraph in place of the shared one
(`tools/gen-art.mjs BOSS_COMPOSITION`; the shared one asks for feet, and
the first instruction wins): a wide picture, the figure from the waist up
filling the height, looming over the viewer, the weapon sweeping across
the full width and out of the frame. Drawn at 4:3 onto a wide canvas
(the boss card is twice as wide, 0.196).

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
| Vampire Lord (boss) | `vampire_lord.webp` | `CHARACTER: the Vampire Lord, a tall gaunt lord with a skull-like face in a long dark high-collared cloak, holding a curved golden sword. Regal and terrifying, the boss. BOSS: ornate gold armour under the cloak, a tall collar, a thin crown, embers in the air — a lord, not a reaper. ACCENT: black cloak with gold trim and a high collar, the golden sword glowing warm, ember-orange eyes; regal, not ragged.` |
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
