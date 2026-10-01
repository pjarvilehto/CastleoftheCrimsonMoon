# Narration script: the Old Wizard

> **In the game since 0.157.** `node tools/gen-vo.mjs` renders this file's
> tables (the Old Wizard voice from the ElevenLabs library, stability 0.5,
> style 0.1, speed 0.9; the earliest takes at 0.4 / 0.2) into
> `assets/audio/vo/` and `assets/data/narration.json`; the "How often"
> column lives as rules in `assets/data/audio.json narration.lines`, and
> `src/audio/narrator.js` plays them. The tool sends "!" as "." and drops
> stage directions and a leading "…" (the voice shouted the one and
> mumbled the other). Change a line here, delete its files, run the tool.
> "SMASH" is the game's multi-kill line; OVERKILL is the one-blow room wipe.

## Voice direction

An old wizard: a chronicler who has watched the castle swallow knights for
centuries. He is unhurried, a little weary, dryly amused and never shouting,
even on "Overkill!". Think fireside storyteller crossed with a judge. He is
low and close to the microphone, with some gravel and breath, and has no
accent gimmicks.

**ElevenLabs tips**
- Pick an "old", "wise" or "narrator" voice from the Voice Library, or design
  one: *"elderly male wizard, deep, slow, gravelly, intimate, storyteller"*.
- Settings to start from: Stability ~40%, Similarity ~75%, Style ~20%,
  speed 0.85–0.9. Lower stability gives more drama; raise it if takes wobble.
- Ellipses ("…") make pauses and dashes make short breaks. Generate each take
  separately and keep the best one.
- Download as MP3 (44.1 kHz, 128 kbps or better), with no music or effects.
  The game adds reverb if needed.

**File names.** Use the ID in the table, then the take number:
`vo_descent_begin_1.mp3`, `vo_descent_begin_2.mp3`, … Upload them all as one
batch, like the art.

**How often.** "Every" means the line plays each time the moment happens.
"Sometimes" means a chance per event, so it doesn't get old. "Once" means once
per save. Where a line has several takes, the game picks one at random and
never plays the same take twice in a row.

**Keep it short.** Every line is a fragment of a few words, said as if the
wizard were only half talking to you. Short lines fit between blows and
transitions, and they wear better on the hundredth hearing.

---

## 1. Entering and leaving the castle

| ID | Line | When | How often |
|---|---|---|---|
| `title_welcome` | 1. "The Crimson Moon rises…" 2. "The castle wakes…" 3. "Another night…" 4. "Welcome back, knight…" | Title screen, first click | Every session |
| `hall_return` | 1. "Rest… while you can." 2. "You live." 3. "Back again…" 4. "The hearth is warm… for now." | Entering the Great Hall after a run | Sometimes (40%) |
| `descent_begin` | 1. "…your descent begins…" 2. "Down… into the dark." 3. "Only forward now." 4. "The doors close behind you…" | Descend from the Great Hall | Every |
| `retreat` | 1. "Wise." 2. "The castle will wait…" 3. "Live to bleed another day." 4. "Run, then…" | Retreat to the Great Hall | Every |

## 2. The deeper stretches

| ID | Line | When | How often |
|---|---|---|---|
| `stretch_2` | 1. "…the stone grows colder here." 2. "The walls are listening now…" 3. "Deeper… and darker." 4. "Mind the shadows here…" | Entering room 9 | Every |
| `stretch_3` | 1. "Few knights have walked this far…" 2. "Fewer still walked back…" 3. "The heart of the castle is near…" 4. "Even the moon cannot see you here…" | Entering room 17 | Every |
| `new_record` | 1. "Deeper than ever before…" 2. "Uncharted dark…" 3. "No knight of yours has stood here…" 4. "New ground… new dangers." | First room past the save's best | Once per run |

## 3. Combat

| ID | Line | When | How often |
|---|---|---|---|
| `overkill` | 1. "Overkill!" 2. "Overkill…" 3. "*(dry chuckle)* Overkill." 4. "Overkill… magnificent." | OVERKILL | First in each room, then 25% |
| `smash` | 1. "Smash!" 2. "Shattered!" 3. "Crushed!" 4. "Broken…" | SMASH | Sometimes (30%) |
| `mega_crit` | 1. "Devastating!" 2. "*Ha!*" 3. "What a blow!" 4. "They felt that in the walls…" | Mega crit | Sometimes (50%) |
| `room_cleared` | 1. "Silence…" 2. "For now…" 3. "The room is yours." 4. "Still… at last." | Room cleared | Sometimes (20%) |
| `low_hp` | 1. "Your blood runs thin…" 2. "Drink, fool…" 3. "Careful now…" 4. "The castle smells your blood…" | HP falls to 35% or less | Once per room, then a 30 s cooldown |
| `potion` | 1. "Drink deep." 2. "Bitter…" 3. "Better…" 4. "It holds… for now." | Drinking a potion | Sometimes (20%) |
| `revive` | 1. "Rise!" 2. "Not yet…" 3. "The Heart beats again…" 4. "Death refuses you…" | The revive relic triggers | Every |
| `elite` | 1. "Careful…" 2. "An old one…" 3. "This one is different…" 4. "It has killed before…" | A room with an elite enemy | Sometimes (50%) |

## 4. Bosses

| ID | Line | When | How often |
|---|---|---|---|
| `boss_enter` | 1. "He has been expecting you…" 2. "The throne room…" 3. "Bow… or bleed." 4. "The Lord awaits…" | Entering a boss room | Every |
| `boss_summon` | 1. "He calls his children…" 2. "More of them…" 3. "From the walls…" 4. "They answer his call…" | First summon in a boss fight | Once per fight |
| `boss_slain` | 1. "The Lord falls…" 2. "Dust and ashes." 3. "Onward…" 4. "The throne stands empty… for now." | Boss defeated (rooms 8 and 16) | Every |
| `victory` | "…It is done. The castle sleeps." | Beating the room-24 boss (the victory screen) | Once per save |

## 5. Shrines and treasure

| ID | Line | When | How often |
|---|---|---|---|
| `shrine_enter` | 1. "A shrine… for a price." 2. "Kneel…" 3. "Old gods listen here…" 4. "Something wants to bargain…" | Entering a shrine | Every |
| `shrine_take` | 1. "The bargain is struck." 2. "Never freely…" 3. "Power… at a price." 4. "So be it." | Taking a boon | Sometimes (50%) |
| `treasure_enter` | 1. "Choose…" 2. "Only one will open…" 3. "Gold… steel… or blood?" 4. "Three chests… choose well." | Entering a treasure room | Every |
| `chest_coffer` | 1. "Coin…" 2. "Heavy… and honest." 3. "Gold glitters…" 4. "Riches." | Opening the Iron Coffer | Every |
| `chest_gilded` | 1. "Steel, for your hand." 2. "Fine work…" 3. "Made for you…" 4. "A gift… of sorts." | Opening the Gilded Chest | Every |
| `chest_reliquary` | 1. "The seal drinks…" 2. "Always blood." 3. "Blood for the old things…" 4. "It tastes you…" | Opening the Sealed Reliquary | Every |
| `relic_found` | 1. "*Ahh…* a relic." 2. "Hold it close…" 3. "A thousand years in the dark…" 4. "The moon's own treasure…" | Finding a tier-4 relic | Every |

## 6. Death

| ID | Line | When | How often |
|---|---|---|---|
| `death` | 1. "The castle claims another soul." 2. "…and so the knight falls." 3. "Darkness…" 4. "Another name for the walls…" | Death | Every |
| `death_reliquary` | 1. "Greed…" 2. "Too much blood…" 3. "The seal took everything…" 4. "Greed kills…" | Killed by the reliquary's price | Every (replaces `death`) |
| `death_boss` | 1. "The Lord feeds tonight." 2. "He drinks deep…" 3. "Not this night…" 4. "The throne keeps its master…" | Killed by a boss | Every (replaces `death`) |

## 7. The Great Hall

| ID | Line | When | How often |
|---|---|---|---|
| `level_up` | 1. "Stronger…" 2. "You grow." 3. "Better…" 4. "The castle will have to try harder…" | Level up after a run | Sometimes (50%) |
| `forge` | 1. "The forge remembers…" 2. "Hot iron…" 3. "Steel waits…" 4. "Hammer and flame…" | First visit to the forge in a session | Sometimes (30%) |
| `first_death` | "The first of many…" | The save's first death | Once |

---

**Count:** 32 IDs and 122 takes in all (four takes each; the two
once-per-save lines have one), about 3 minutes of audio. Most lines are two
to five words.
