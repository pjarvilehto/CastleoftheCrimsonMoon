# Room prompts: new paintings in the rooms' style

The 50 room, throne, treasure and shrine paintings in `assets/bg/` are the style
(48 of the developer's batches, 0.153–0.182, all of them approved as they
are, 0.00236; two painted by this tool, The Clock Tower and The Blood
Baths, 0.00244). A new room is painted from its line as text alone (the
recipe below; `--refs` optionally attaches two of the paintings as
references) by `tools/gen-bg.mjs` — the model picked by the bake-off below
— into `assets/bg/candidates/`, and imported as a 2048x1152 JPEG with its
depth map (`python3 tools/gen-depth.py`) under a NEW filename.

## The recipe the paintings were made with

`docs/image-prompting-guide.md` (the developer's, 0.00237: every prompt the
paintings came from, Kimi's image service) — the style is carried by the
wording alone, no reference pictures. Three parts, in this order:

1. **Subject:** one short sentence in the guide's shape — the room, a few
   things in it, the palette cue last ("smoky torches, guttering flames,
   wet flagstones, amber"); the palette is what keeps each room its own.
2. **Mood / composition:** `gloomy and moody, deep shadows, oppressive
   atmosphere` for a room; a boss arena gets `video game boss arena
   background art, wide symmetrical battle stage composition with open
   floor space in the center` instead (the guide's modifiers; `MOOD` /
   `ARENA` in the tool, the Kind column picks).
3. **The style block**, word for word, always last.

## Style block

```
in the combined style of Darkest Dungeon 2 and Mike Mignola, heavy black ink silhouettes, bold flat angular shapes, rough hand-drawn ink texture and hatching, dramatic chiaroscuro lighting, video game background art, wide shot, no characters
```

## How it is used

`tools/gen-bg.mjs` sends `<line>, <mood>, <style block>` as text alone
(the recipe; the default), or with two of the game's paintings of the
room's hue family attached as references (`--refs`, optional; `REFS` in
the tool picks them, `--refs a.jpg,b.jpg` others — it adds little) — the
bake-off ran both. 16:9 (GPT Image
paints 3:2 and is cropped). Each candidate is kept at the model's own
size (`assets/bg/candidates/<id>_c<n>.jpg`) and recorded in
`assets/data/rooms-art.json`; the Background Lab (`labs/backgrounds/`)
is where they are approved, rejected with a note or regenerated with
notes (COPY JSON → `--rerender`), `--prune` drops a room's unapproved
candidates and `--import` makes the 2048x1152 JPEG the game loads. Hue families (the guide's palette table): amber, red, cold, teal,
violet, bone, green, ice.

## Rooms

The bake-off rooms (0.00237): three rooms the game did not have then, one
per hue family, painted on every model with the same prompt. The Clock
Tower and The Blood Baths are in the game since 0.00244 (imported from
their approved candidates); The Rookery sits in the Background Lab as a
draft.

| Id | Name | Hue | Kind | Line |
|---|---|---|---|---|
| clock_tower | The Clock Tower | amber | room | clock tower interior, enormous brass gears and escapements, a great bell in the dark above, chains and counterweights, a lantern on the floor, brass and amber |
| blood_baths | The Blood Baths | red | room | ruined bathhouse under the castle, a long sunken pool of dark crimson water, cracked marble pillars, steam, candles on the rim, a hooded statue, crimson and black |
| rookery | The Rookery | cold | room | crumbling tower loft open to the night sky, crows hunched on rafters and ledges, moonlight through the broken roof, bones and straw, cold slate blue |

Two of the guide's own lines were also sent exactly as written (`--prompt`,
hue `verbatim` in `assets/data/rooms-art.json`, so they are not rows of
these tables — a plain run would otherwise paint them again):
`guide_torch_corridor` (The Torchlit Passage, the guide's example; one
candidate approved) and `guide_ossuary` (The Ossuary; eleven candidates,
no verdict yet).

The guide's own rooms the game does not have (0.00242; its lines, as
written there):

| Id | Name | Hue | Kind | Line |
|---|---|---|---|---|
| corridor_collapsed_gallery | The Collapsed Gallery | cold | room | a collapsed gallery, broken beams, moonlight through the shattered roof, cold blue shafts |
| corridor_spiral_stair | The Spiral Stair | red | room | a tower stairwell descending into darkness, a red glow from below |
| antechamber_crimson_veil | The Crimson Veil | red | room | a velvet-draped ruin, black candles, cracked mirrors, a door veiled in red silk |
| throne_drowned_king | The Drowned Throne | teal | arena | a black coral throne in ankle-deep seawater, anglerfish lanterns, abyssal teal |
