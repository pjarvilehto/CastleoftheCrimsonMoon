# Portrait prompts for Kimi: knight and enemies in the room style

Goal: redraw the 13 character portraits (the knight and 12 enemies) in the
style of the room paintings, "Mike Mignola meets Darkest Dungeon 2", keeping
each character's identity, pose and colour accent so the game's animations
and hit effects still fit.

## How to use

1. Attach **two reference images** to each request:
   - **Image 1:** the character's current portrait from `assets/chars/`, for
     the design and pose.
   - **Image 2:** one room painting from `assets/bg/`, for the style.
     `dungeon_ossuary.jpg` (warm) or `castle_courtyard.jpg` (cold) suit
     most characters.
2. Paste the **style block** below, then that character's **character
   line**.
3. Ask for a **2:3 portrait** (vertical). Generate 2–4 variants and keep the
   best.
4. Start with the pilot of three: **the Curious Knight, the Giant Rat and the
   Vampire Lord**. Once those look right in the game, do the rest with the
   same wording.

## Style block (the same for every character)

```
Redraw the character from image 1 in the exact art style of image 2.

STYLE: Mike Mignola meets Darkest Dungeon 2. Hand-painted dark gothic
comic illustration. Heavy black ink shapes and spot blacks, bold chunky
silhouette, thick confident ink outlines, flat graphic shadows with very
few midtones, rough dry-brush and crosshatch texture, matte finish.
Muted, desaturated palette: umber, ochre, tarnished gold, cold slate
blue-grey, with oxblood red as the accent. Glows only where the character
has them, small and crisp, never bloom. One dramatic light source from the
upper left with a thin rim light on the right edge.

COMPOSITION: one character only, full body from head to toe, nothing
cropped, centred with a small margin. Three-quarter view, [FACING].
Plain flat light grey background (#c8c8c8), completely empty: no floor,
no ground shadow, no scenery, no frame, no text, no watermark.

KEEP from image 1: the character's identity, silhouette, pose,
proportions, colour accents and glowing details.

AVOID: photorealism, 3D render, glossy plastic look, soft airbrush
gradients, lens blur, bloom, neon colours, busy detail that turns to mush
at small size.
```

Set `[FACING]` to **facing left** for every enemy (they face the knight),
and **facing right** for the knight.

## Character lines (paste after the style block)

| Character | File | Character line |
|---|---|---|
| The Curious Knight | `player.webp` | `CHARACTER: a young dark-haired knight with no helmet, worn leather and chainmail, a long straight sword held low in a lunging fighting stance. Facing right.` |
| Giant Rat | `rat.webp` | `CHARACTER: a huge hunched black sewer rat, matted fur, pink ears and scaly tail, small glowing pale eyes, bared yellow fangs, clawed forepaws.` |
| Cave Shrieker | `cave_shrieker.webp` | `CHARACTER: an emaciated bat-like cave horror with wet blue-black skin, long spindly clawed limbs, torn wing membranes and a gaping fanged maw, hunched forward.` |
| Skeleton | `skeleton.webp` | `CHARACTER: a skeleton warrior in rusted scraps of armour and rags, small glowing eyes, holding a notched sword whose blade glows a faint cold blue.` |
| Cinderborn | `ghoul.webp` | `CHARACTER: a tall hooded figure in a charred robe, a burning ember heart in its chest, glowing orange cracks in the cloth and embers drifting off it.` |
| Cult Acolyte | `cultist.webp` | `CHARACTER: a hooded cultist in heavy black robes with a leather belt and sash, a blank mask with two glowing orange eye slits, a curved dagger in one hand.` |
| Fellblade | `golem.webp` | `CHARACTER: a hulking shaggy brute with glowing red eyes, dragging a huge rusted greatsword, a faint red haze around its lower body.` |
| Wraith | `wraith.webp` | `CHARACTER: a floating hooded spectre with a skull face, a tattered shroud that dissolves into mist at the bottom, long bony hands. Cold, ghostly, no feet.` |
| Gargoyle | `gargoyle.webp` | `CHARACTER: a crouching stone gargoyle of pale cracked stone, curved horns, a snarling fanged face, folded bat wings, clawed feet.` |
| Vampire Lord (boss) | `vampire_lord.webp` | `CHARACTER: the Vampire Lord, a tall gaunt lord with a skull-like face in a long dark high-collared cloak, holding a curved golden sword. Regal and terrifying, the boss.` |
| Crypt Spider | `crypt_spider.webp` | `CHARACTER: a giant spider with a black spiked carapace, glowing red eyes and a glowing red rune on its back, long jagged legs.` |
| Hollow Hound | `hollow_hound.webp` | `CHARACTER: a skeletal hellhound with dark cracked hide, glowing red cracks and a burning red core in its chest, bared fangs.` |
| Blood Knight | `blood_knight.webp` | `CHARACTER: a knight in jagged crimson armour and a hood, a glowing red sigil on the chest, holding a long blood-red sword point down.` |

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
