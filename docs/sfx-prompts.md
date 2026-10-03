# The classes' and the foes' sounds — prompts for `tools/gen-sfx.mjs` (0.00270 / 0.00271)

Each class's own attack, heavy and get-hit sound, rendered through
ElevenLabs' sound generation (`POST /v1/sound-generation`; the key needs
the `sound_generation` permission — the developer granted it in 0.00271)
into `assets/audio/sfx/<clip>_v<k>.mp3` and pointed at from
`assets/data/audio.json clips.<clip>.file` (the measured loudness with
it). Every clip in the tables below is rendered (0.00271: the classes'
and the foes'); the class's synth layers (`audio/synth.js`, the
`variation` entry) ride on top of the recording as its colour. Before
the render each entry played the developer's strike / hurt recording
pitched per class (0.00270).

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
| atk_druid | 0.8 | A gnarled wooden staff striking with a sharp crack and thorns raking across flesh, dry, close, no reverb |
| heavy_druid | 1.3 | Thick roots bursting up out of the earth and wrapping tight with a woody creak, soil scattering, leaves rustling, dry, close |
| hurt_druid | 0.7 | A man grunts in pain as he is struck, a low growl under it, one short hit, dry, close |
| atk_hexhunter | 0.8 | A hand crossbow firing: a sharp click, a bolt whistling and a thunk into flesh, dry, close, no reverb |
| heavy_hexhunter | 1.3 | A witch's hex cast: a glass bell chime, a whispered curse and a crackle of violet sparks, dry, close |
| hurt_hexhunter | 0.7 | A woman gasps and grunts in pain as she is struck, leather creaks, one short hit, dry, close |
| atk_plaguesister | 0.9 | A heavy iron censer swung on a chain, clinking and striking with a dull thud and a hiss of smoke, dry, close |
| heavy_plaguesister | 1.5 | A funeral rite: a small bell tolls, incense smoke hisses and spreads, a whispered prayer, dry, close |
| hurt_plaguesister | 0.7 | A woman cries out in pain as she is struck, muffled by a veil, chains clink, one short hit, dry, close |

## The foes (0.00271, the developer's ask: every character its own)

`eatk_<id>` plays with the hero's hurt as the foe strikes him, `ehurt_<id>`
with the hero's blow as the foe is struck (`ui/combatSfx.js` layers them
on the attack sound by the unit's id; a foe without a clip is silent as
before). The same rules: short, dry, close, the loudest moment early.

| clip | seconds | prompt |
|---|---|---|
| eatk_rat | 0.7 | A giant rat biting with a vicious squeak and a wet snap of teeth, dry, close, no reverb |
| ehurt_rat | 0.7 | A giant rat shrieking in pain, a sharp high squeal, one short cry, dry, close |
| eatk_bat | 0.8 | A huge bat shrieking and swooping, a leathery flap and a piercing screech, dry, close, no reverb |
| ehurt_bat | 0.7 | A bat screeching in pain, high and ragged, one short cry, dry, close |
| eatk_skeleton | 0.8 | A skeleton swinging a rusty sword with a clatter of bones and a dull blade impact, dry, close, no reverb |
| ehurt_skeleton | 0.7 | Dry bones cracking and clattering as a skeleton is struck, one short rattle, dry, close |
| eatk_ghoul | 0.9 | A burning ghoul lunging with a whoosh of flame and a scorching slap, embers hissing, dry, close, no reverb |
| ehurt_ghoul | 0.7 | A burning ghoul howling in pain, a crackle of fire and a hiss of embers, one short cry, dry, close |
| eatk_cultist | 0.8 | A hooded cultist stabbing with a dagger, a whispered chant and a quick wet thrust, dry, close, no reverb |
| ehurt_cultist | 0.7 | A man in robes crying out in pain, a strangled gasp, one short cry, dry, close |
| eatk_golem | 1.0 | A huge iron blade golem swinging a massive sword, a deep grinding whoosh and a crushing metallic impact, dry, close |
| ehurt_golem | 0.8 | A blow ringing off a huge iron construct, a deep clang and grinding metal, one short hit, dry, close |
| eatk_wraith | 0.9 | A wraith attacking with a ghostly wail and a freezing rush of wind, a cold touch, dry, close, no reverb |
| ehurt_wraith | 0.8 | A wraith shrieking in pain, a hollow ghostly wail breaking up, one short cry, dry, close |
| eatk_gargoyle | 0.9 | A stone gargoyle slashing with stone claws, a grinding scrape and a heavy thud, dry, close, no reverb |
| ehurt_gargoyle | 0.7 | Stone cracking as a gargoyle is struck, a sharp crack and crumbling grit, one short hit, dry, close |
| eatk_vampire_lord | 1.0 | A vampire lord striking with a dark hiss, a rush of bats' wings and a deep sinister impact, dry, close |
| ehurt_vampire_lord | 0.8 | A vampire lord snarling in pain, a deep inhuman hiss and growl, one short cry, dry, close |
| eatk_crypt_spider | 0.8 | A giant spider biting with chittering mandibles and a wet venomous snap, dry, close, no reverb |
| ehurt_crypt_spider | 0.7 | A giant spider screeching in pain, a chittering hiss, one short cry, dry, close |
| eatk_hollow_hound | 0.8 | A hollow hound lunging with a snarl and a snap of jaws, a deep bark, dry, close, no reverb |
| ehurt_hollow_hound | 0.7 | A hound yelping in pain, a sharp whimpering yelp, one short cry, dry, close |
| eatk_blood_knight | 0.9 | A blood knight swinging a great sword, a heavy whoosh and a brutal steel impact, armour clanking, dry, close |
| ehurt_blood_knight | 0.7 | A knight in heavy armour grunting as he is struck, steel plate clanging, one short hit, dry, close |
