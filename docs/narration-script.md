# Narration script: the Old Wizard

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
| `title_welcome` | 1. "The Crimson Moon rises…" 2. "The castle wakes…" | Title screen, first click | Every session |
| `hall_return` | 1. "Rest… while you can." 2. "You live." 3. "Back again…" | Entering the Great Hall after a run | Sometimes (40%) |
| `descent_begin` | 1. "…your descent begins…" 2. "Down… into the dark." 3. "Only forward now." | Descend from the Great Hall | Every |
| `retreat` | 1. "Wise." 2. "The castle will wait…" | Retreat to the Great Hall | Every |

## 2. The deeper stretches

| ID | Line | When | How often |
|---|---|---|---|
| `stretch_2` | "…the stone grows colder here." | Entering room 9 | Every |
| `stretch_3` | "Few knights have walked this far…" | Entering room 17 | Every |
| `new_record` | 1. "Deeper than ever before…" 2. "Uncharted dark…" | First room past the save's best | Once per run |

## 3. Combat

| ID | Line | When | How often |
|---|---|---|---|
| `overkill` | 1. "Overkill!" 2. "Overkill…" 3. "*(dry chuckle)* Overkill." | OVERKILL | First in each room, then 25% |
| `smash` | 1. "Smash!" 2. "Shattered!" | SMASH | Sometimes (30%) |
| `mega_crit` | 1. "Devastating!" 2. "*Ha!*" | Mega crit | Sometimes (50%) |
| `room_cleared` | 1. "Silence…" 2. "For now…" | Room cleared | Sometimes (20%) |
| `low_hp` | 1. "Your blood runs thin…" 2. "Drink, fool…" | HP falls to 35% or less | Once per room, then a 30 s cooldown |
| `potion` | 1. "Drink deep." 2. "Bitter…" | Drinking a potion | Sometimes (20%) |
| `revive` | 1. "Rise!" 2. "Not yet…" | The revive relic triggers | Every |
| `elite` | 1. "Careful…" 2. "An old one…" | A room with an elite enemy | Sometimes (50%) |

## 4. Bosses

| ID | Line | When | How often |
|---|---|---|---|
| `boss_enter` | 1. "He has been expecting you…" 2. "The throne room…" 3. "Bow… or bleed." | Entering a boss room | Every |
| `boss_summon` | 1. "He calls his children…" 2. "More of them…" | First summon in a boss fight | Once per fight |
| `boss_slain` | 1. "The Lord falls…" 2. "Dust and ashes." | Boss defeated (rooms 8 and 16) | Every |
| `victory` | "…It is done. The castle sleeps." | Beating the room-24 boss (the victory screen) | Once per save |

## 5. Shrines and treasure

| ID | Line | When | How often |
|---|---|---|---|
| `shrine_enter` | 1. "A shrine… for a price." 2. "Kneel…" | Entering a shrine | Every |
| `shrine_take` | 1. "The bargain is struck." 2. "Never freely…" | Taking a boon | Sometimes (50%) |
| `treasure_enter` | 1. "Choose…" 2. "Only one will open…" | Entering a treasure room | Every |
| `chest_coffer` | "Coin…" | Opening the Iron Coffer | Every |
| `chest_gilded` | "Steel, for your hand." | Opening the Gilded Chest | Every |
| `chest_reliquary` | 1. "The seal drinks…" 2. "Always blood." | Opening the Sealed Reliquary | Every |
| `relic_found` | 1. "*Ahh…* a relic." 2. "Hold it close…" | Finding a tier-4 relic | Every |

## 6. Death

| ID | Line | When | How often |
|---|---|---|---|
| `death` | 1. "The castle claims another soul." 2. "…and so the knight falls." 3. "Darkness…" | Death | Every |
| `death_reliquary` | "Greed…" | Killed by the reliquary's price | Every (replaces `death`) |
| `death_boss` | "The Lord feeds tonight." | Killed by a boss | Every (replaces `death`) |

## 7. The Great Hall

| ID | Line | When | How often |
|---|---|---|---|
| `level_up` | 1. "Stronger…" 2. "You grow." | Level up after a run | Sometimes (50%) |
| `forge` | "The forge remembers…" | First visit to the forge in a session | Sometimes (30%) |
| `first_death` | "The first of many…" | The save's first death | Once |

---

**Count:** 32 IDs and 60 takes in all, about 1½ minutes of audio. Most lines
are two to five words.
