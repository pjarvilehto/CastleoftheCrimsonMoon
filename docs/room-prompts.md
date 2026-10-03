# Room prompts: new paintings in the rooms' style

The 47 room, throne and treasure paintings in `assets/bg/` are the style
(the owner's batches, 0.153–0.182; all of them approved as they are,
0.00235). A new room is painted from two of them as references by
`tools/gen-bg.mjs` — one model picked by the bake-off below — into
`assets/bg/candidates/`, and imported as a 2048x1152 JPEG with its depth
map (`python3 tools/gen-depth.py`) under a NEW filename.

## The style, as the paintings have it

Heavy black ink over flat, painterly colour: every edge drawn with a bold
brush line, the shadows cross-hatched or scratched in, no soft airbrush
gradients. One dominant hue per room (a blood red, an ember amber, a cold
blue-grey, a bone grey-green), with the rest of the picture near black.
One strong light source — a hearth, a window, a glowing floor, moonlight —
and everything else falling into deep shadow. A wide, roughly symmetric
vista at eye height, the floor running from the bottom edge to a far wall
or doorway at the centre, so there is room for the cards in front of it.
Rich, repeated architectural detail (stone courses, vaults, pillars,
hanging chains, candle stands) and clutter in the foreground corners. No
people, no monsters, no text. Think a printed woodcut tinted with gouache:
Darkest Dungeon's interiors, Mignola's blacks.

## Style block

```
STYLE: a dark-fantasy castle interior painted exactly in the style of the reference paintings: heavy black ink line work with bold brush edges and cross-hatched shadows over flat, painterly colour, like a tinted woodcut. One dominant hue family for the whole room with everything else near black; one strong light source and deep shadow elsewhere; no soft gradients, no photoreal rendering, no 3D render look. A wide, symmetric vista at eye height, the floor running from the bottom edge to the far wall at the centre, rich repeated architectural detail, clutter in the foreground corners. No people, no creatures, no text, no watermark, no border. 16:9.
```

## How it is used

`tools/gen-bg.mjs` attaches two reference paintings of the room's hue
family (`REFS` in the tool: the two closest in colour; `--refs a.jpg,b.jpg`
picks others), pastes the style block, then the room's line with its name
and hue, and asks for 16:9 (GPT Image paints 3:2 and is cropped). Each
candidate is kept at the model's own size (`assets/bg/candidates/
<id>_c<n>.jpg`) and recorded in `assets/data/rooms-art.json`; `--import`
makes the 2048x1152 JPEG the game loads.

## Rooms

The bake-off rooms (0.00235): three rooms the game does not have, one per
hue family, painted on every model with the same prompt and references.

| Id | Name | Hue | Line |
|---|---|---|---|
| clock_tower | The Clock Tower | amber | ROOM: the inside of a castle clock tower, enormous brass gears and escapements filling the walls, a great bell hanging above, chains and counterweights, a wooden gallery, the works lit amber by a lantern on the floor. HUE: brass amber and warm bronze on black. |
| blood_baths | The Blood Baths | red | ROOM: a ruined Roman-style bathhouse under the castle, a long sunken pool of dark red water down the centre, cracked marble pillars, steam, candles on the rim, a statue at the far end. HUE: blood red and crimson on black. |
| rookery | The Rookery | cold | ROOM: a crumbling tower loft open to the night sky, hundreds of crows perched on rafters and ledges, moonlight through a broken roof, bones and straw on the floor, the cold moon low at the centre. HUE: cold blue-grey moonlight on black. |
