# The classes' sounds — prompts for `tools/gen-sfx.mjs` (0.00270)

Each class's own attack, heavy and get-hit sound, rendered through
ElevenLabs' sound generation (`POST /v1/sound-generation`; the key needs
the `sound_generation` permission) into `assets/audio/sfx/<clip>_v<k>.mp3`
and pointed at from `assets/data/audio.json clips.<clip>.file` (the
measured loudness with it). Until a clip is rendered its entry plays the
developer's strike / hurt recording pitched per class, with the class's
synth layers (`audio/synth.js`) — the layers stay after a render too.

Short, dry, close-miked, no music, no reverb tail: the game pans and
layers them itself. The attack lands on the blow (`combatFx.strikeMs`),
so the sound's loudest moment should sit near its start.

| clip | seconds | prompt |
|---|---|---|
| atk_knight | 0.8 | A sword striking leather and flesh, one quick heavy blow, dry and close, no reverb |
| heavy_knight | 1.0 | A heavy two-handed sword blow landing with a steel ring and a deep thud, dry, close, no reverb |
| hurt_knight | 0.7 | A man grunts sharply as he is struck, armour clinks, one short hit, dry, close |
| atk_barbarian | 0.9 | A heavy axe chopping into flesh with a wet crunch, a grunt of effort, dry, close, no reverb |
| heavy_barbarian | 1.2 | A huge axe swung wide with a deep whoosh and a crushing double impact, a roar of effort, dry, close |
| hurt_barbarian | 0.8 | A big man roars in pain as he is struck, a deep guttural grunt, one short hit, dry, close |
| atk_wizard | 0.8 | A staff strike with a short arcane crackle and a zap of blue energy, dry, close, no reverb |
| heavy_wizard | 1.4 | A fireball bursting: a whoosh of flame, a deep boom and crackling fire dying away, dry, close |
| hurt_wizard | 0.7 | An old man gasps and grunts in pain as he is struck, thin and reedy, one short hit, dry, close |
| atk_necromancer | 0.9 | A grave knife stabbing with a ghostly whisper and a cold wind, dry, close, no reverb |
| heavy_necromancer | 1.4 | Souls torn out of a body: a rising ghostly wail, a sucking rush of air and a dark chord, dry, close |
| hurt_necromancer | 0.7 | A gaunt man hisses and grunts in pain as he is struck, dry, thin, one short hit, close |
| atk_druid | 0.8 | Claws raking across flesh, three quick scratches with a snarl, dry, close, no reverb |
| heavy_druid | 1.3 | A man transforming into a beast: bones cracking, a deep growl rising to a roar, leaves rustling, dry, close |
| hurt_druid | 0.7 | A man yelps and growls in pain as he is struck, half beast, one short hit, dry, close |
| atk_hexhunter | 0.8 | A hand crossbow firing: a sharp click, a bolt whistling and a thunk into flesh, dry, close, no reverb |
| heavy_hexhunter | 1.3 | A witch's hex cast: a glass bell chime, a whispered curse and a crackle of violet sparks, dry, close |
| hurt_hexhunter | 0.7 | A woman gasps and grunts in pain as she is struck, leather creaks, one short hit, dry, close |
| atk_plaguesister | 0.9 | A heavy iron censer swung on a chain, clinking and striking with a dull thud and a hiss of smoke, dry, close |
| heavy_plaguesister | 1.5 | A funeral rite: a small bell tolls, incense smoke hisses and spreads, a whispered prayer, dry, close |
| hurt_plaguesister | 0.7 | A woman cries out in pain as she is struck, muffled by a veil, chains clink, one short hit, dry, close |
