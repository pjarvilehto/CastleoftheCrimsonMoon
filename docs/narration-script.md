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

---

## 1. Entering and leaving the castle

| ID | Line | When | How often |
|---|---|---|---|
| `title_welcome` | 1. "The Crimson Moon rises… and the castle wakes." 2. "Another night. Another knight. Come… the castle is hungry." | Title screen, first click | Every session |
| `hall_return` | 1. "Back in the Great Hall… rest, while you can." 2. "You live. The castle will remember that." 3. "Sharpen your blade. The dark has not forgotten you." | Entering the Great Hall after a run | Sometimes (40%) |
| `descent_begin` | 1. "…your descent begins…" 2. "Down, then. Into the dark." 3. "The doors close behind you. Only forward now." | Descend from the Great Hall | Every |
| `retreat` | 1. "Wise. The castle will wait… it always does." 2. "You flee with your gold. There is no shame in living." | Retreat to the Great Hall | Every |

## 2. The deeper stretches

| ID | Line | When | How often |
|---|---|---|---|
| `stretch_2` | "Rooms nine and onward… the stone grows colder here." | Entering room 9 | Every |
| `stretch_3` | "Seventeen rooms deep. Few knights have walked this far… fewer walked back." | Entering room 17 | Every |
| `new_record` | 1. "Deeper than ever before… the castle notices you now." 2. "No knight of yours has stood here. Mark it well." | First room past the save's best | Once per run |

## 3. Combat

| ID | Line | When | How often |
|---|---|---|---|
| `overkill` | 1. "Overkill!" 2. "Overkill… magnificent." 3. "*(dry chuckle)* Overkill." | OVERKILL | First in each room, then 25% |
| `smash` | 1. "Smash!" 2. "Shattered!" | SMASH | Sometimes (30%) |
| `mega_crit` | 1. "A devastating blow!" 2. "*Ha!* They felt that in the walls." | Mega crit | Sometimes (50%) |
| `room_cleared` | 1. "Silence… for now." 2. "The room is yours." 3. "They will not rise again. Probably." | Room cleared | Sometimes (20%) |
| `low_hp` | 1. "Your blood runs thin, knight…" 2. "Drink, fool… drink!" 3. "The castle smells your weakness." | HP falls to 35% or less | Once per room, then a 30 s cooldown |
| `potion` | 1. "Bitter… but it holds the soul in place." 2. "Drink deep." | Drinking a potion | Sometimes (20%) |
| `revive` | 1. "The Heart of the Dying Moon beats again… rise!" 2. "Not yet. The moon is not done with you." | The revive relic triggers | Every |
| `elite` | 1. "This one is… different. Careful." 2. "An old one. It has killed knights before you." | A room with an elite enemy | Sometimes (50%) |

## 4. Bosses

| ID | Line | When | How often |
|---|---|---|---|
| `boss_enter` | 1. "The throne room… he has been expecting you." 2. "Bow, knight… or bleed. The Vampire Lord does not care which." 3. "Every eighth door leads here. To him." | Entering a boss room | Every |
| `boss_summon` | 1. "He calls his children…" 2. "More of them… from the walls themselves." | First summon in a boss fight | Once per fight |
| `boss_slain` | 1. "The Lord falls… but the moon still bleeds." 2. "Dust and ashes. Onward." | Boss defeated (rooms 8 and 16) | Every |
| `victory` | "…It is done. The Crimson Moon sets… and for one night, the castle sleeps. Well fought, Curious Knight. Well fought." | Beating the room-24 boss (the victory screen) | Once per save |

## 5. Shrines and treasure

| ID | Line | When | How often |
|---|---|---|---|
| `shrine_enter` | 1. "A shrine… old gods still listen here, for a price." 2. "Kneel. Something here wants to bargain." | Entering a shrine | Every |
| `shrine_take` | 1. "The bargain is struck." 2. "Power… freely given? No. Never freely." | Taking a boon | Sometimes (50%) |
| `treasure_enter` | 1. "Three chests… and only one will open for you." 2. "Gold, steel, or something older… choose." | Entering a treasure room | Every |
| `chest_coffer` | "Coin. Honest, heavy, dull… and useful." | Opening the Iron Coffer | Every |
| `chest_gilded` | "Steel made for your hand. How… thoughtful." | Opening the Gilded Chest | Every |
| `chest_reliquary` | 1. "The seal drinks… and the reliquary opens." 2. "Blood for the old things. Always blood." | Opening the Sealed Reliquary | Every |
| `relic_found` | 1. "A relic of the Crimson Moon… hold it close." 2. "*Ahh…* that has not seen the light in a thousand years." | Finding a tier-4 relic | Every |

## 6. Death

| ID | Line | When | How often |
|---|---|---|---|
| `death` | 1. "The castle claims another soul." 2. "And so… the knight falls." 3. "Another name for the walls to remember." 4. "Darkness. Then… the Great Hall again." | Death | Every |
| `death_reliquary` | "Greed… the oldest killer in these halls." | Killed by the reliquary's price | Every (replaces `death`) |
| `death_boss` | "The Lord feeds tonight." | Killed by a boss | Every (replaces `death`) |

## 7. The Great Hall

| ID | Line | When | How often |
|---|---|---|---|
| `level_up` | 1. "Stronger… the castle will have to try harder." 2. "You grow. Good." | Level up after a run | Sometimes (50%) |
| `forge` | "The forge remembers every blade it has made." | First visit to the forge in a session | Sometimes (30%) |
| `first_death` | "Your first death. It will not be the last… but each one teaches." | The save's first death | Once |

---

**Count:** 32 IDs and 63 takes in all, roughly 3–4 minutes of audio. Every
line is short enough to finish inside a combat beat or a screen transition.
