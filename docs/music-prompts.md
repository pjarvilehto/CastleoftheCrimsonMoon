# Music prompts — the five beds as generated scores

`tools/gen-score.mjs` reads this file. Every bed is sent to three models
(the bake-off, 0.00273): **ElevenLabs Music** as a composition plan (the
global styles, the avoid list, a section per timestamp below), **Lyria 3
Pro** (Replicate) as one prompt with the sections as `[0:00 - 0:20]`
timestamps — its second take with the bed's painting attached as the
picture to score — and **Stable Audio 2.5** (Replicate) as the style
sentence + the line + the global styles (it ignores structure). The
candidates go to `assets/audio/candidates/` and `assets/data/music-art.json`;
the Music Lab (`labs/music/`) plays them level-matched beside the
procedural bed the game ships today.

Every bed is a LOOP in the game (`src/audio/musicLoop.js`): ask for the
last section to come back to the opening's texture and level, so the
import can cut a seam where the end meets the start. A piece is asked
for longer than the loop the game will play; the cut sets the length.

## Style block

Sent first in every text prompt (Lyria, Stable Audio); its terms open the
global styles of every ElevenLabs plan.

```
Dark cinematic orchestral score for a gothic fantasy video game set in a cursed castle under a crimson moon. Instrumental: no lead vocals, no lyrics; any choir is wordless. Moody and atmospheric, in D minor, recorded in a vast stone hall with long natural reverb. It sits under gameplay and a narrator, so no sudden loud hits and no melody that crowds the middle.
```

Avoid (every bed): `vocals, lyrics, pop, electronic beat, synth lead, bright major key, acoustic guitar, comedy, sudden silence`

## Beds

Each bed: `### id — Name`, then `Seconds:` (the length asked for),
`Painting:` (assets/bg, Lyria's picture), `Line:` (the mood in one
sentence), `Global:` (comma-separated styles), `Avoid:` (added to the
common list), and the sections as `- m:ss-m:ss Name: styles, styles`.

### title — The Crimson Keep

Seconds: 120
Painting: medieval_castle.jpg
Line: The castle seen from afar at night and the Great Hall between runs: vast, slow and melancholy, a sense of an old curse and of coming home to a cold hearth.
Global: slow gothic orchestral, low string chords, D pedal drone, distant church bells, wordless choir, 60 bpm, melancholy, majestic, sparse
Avoid: drums, percussion, fast tempo
- 0:00-0:24 Pedal: a low D drone in the cellos and basses, soft string chords entering one by one, a distant bell
- 0:24-0:54 Strings: the string chords swell slowly, violas carry a long sad line, the bell tolls again far away
- 0:54-1:30 Choir: a wordless choir rises behind the strings, the widest and fullest moment, still slow and restrained
- 1:30-2:00 Return: the choir fades, back to the low D drone and soft string chords of the opening, same level, ready to loop

### combat — Steel in the Dark

Seconds: 90
Painting: dungeon_torch_corridor.jpg
Line: A fight in a torchlit dungeon corridor: tense and driving but not frantic, a steady pulse that can loop under every blow for minutes.
Global: dark orchestral action, low spiccato string ostinato, taiko and frame drums, brass swells, tremolo strings, 96 bpm, tense, driving, relentless
Avoid: drum kit, cymbal crashes on every bar, heroic fanfare
- 0:00-0:16 Ostinato: low spiccato strings alone in a steady 96 bpm ostinato, a soft taiko pulse
- 0:16-0:40 Drums: the taiko and frame drums lock in, low brass swells answer every four bars
- 0:40-1:10 Tension: tremolo high strings and dissonant brass build over the ostinato, the densest stretch, still under control
- 1:10-1:30 Return: the brass and tremolo drop away, back to the strings' ostinato and soft taiko of the opening, ready to loop

### boss — The Vampire Lord

The second brief (after 0.00285). The first — 90 s of organ, chanting choir,
war drums and brass stabs, "the full ensemble at their heaviest" — gave
`boss_c2`, in the game from 0:28 and too in-your-face for a bed under a
whole fight. This one holds the menace back and opens on its pulse, with no
organ solo first.

Seconds: 60
Painting: castle_throne_room.jpg
Line: The throne room and the vampire lord who rules it: menacing and ceremonial but held back, a slow dread that sits under the fight rather than on top of it.
Global: dark brooding orchestral, low string ostinato, soft war drums, distant wordless choir, muted low brass, a bell tolling far away, 72 bpm, menacing, restrained, mid-level dynamics, steady
Avoid: organ solo, full-ensemble climax, brass stabs, cymbal crashes, choir in the foreground, hopeful, triumphant
- 0:00-0:12 Dread: low strings and soft war drums together from the first beat, a bell far away
- 0:12-0:30 Choir: a distant wordless choir behind muted low brass, the drums steady
- 0:30-0:48 Pressure: the string ostinato tightens and the drums fill out a little, still held back
- 0:48-1:00 Return: back to the low strings and soft drums of the opening, ready to loop

### shrine — Sanctum

Seconds: 100
Painting: castle_shrine_gold.jpg
Line: A candlelit shrine where the knight rests and trades: a moment of eerie grace, sacred but not safe.
Global: sacred ambient, soft wordless choir, high string harmonics, celesta, distant bell glints, D major with borrowed minor chords, slow, serene, eerie, no drums
Avoid: drums, percussion, pulse
- 0:00-0:25 Air: high string harmonics and a soft wordless choir, a celesta note now and then
- 0:25-1:05 Grace: the choir warms into D major, a borrowed minor chord darkens it, bell glints far away
- 1:05-1:40 Return: the choir thins to the high strings and harmonics of the opening, ready to loop

### end — Ashes

Seconds: 90
Painting: castle_chapel_exterior.jpg
Line: The run is over, by death or retreat: grief and acceptance, a felt piano over low strings in a ruined chapel.
Global: elegiac, felt piano, low strings, humming wordless choir, slow, 56 bpm, sorrowful, intimate, reflective
Avoid: drums, percussion, grand climax
- 0:00-0:20 Piano: a soft felt piano alone, a few slow notes in D minor
- 0:20-0:55 Strings: low strings enter under the piano, a sad descending line
- 0:55-1:15 Hum: a humming choir rises softly behind them, the emotional peak, still quiet
- 1:15-1:30 Return: the choir and strings fade to the lone felt piano of the opening, ready to loop
