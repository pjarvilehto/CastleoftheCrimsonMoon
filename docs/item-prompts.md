# Item art prompts

The pictures of the gear (`items.json art`, `assets/items/`), painted by
`node tools/gen-items.mjs` from this file: the style block below, then
"The object: " and the item's line. The direction is the developer's
(0.00260): dramatic low-key light, an Unreal Engine 5 render, a touch of
Mike Mignola. Picked over three models on four items: **Nano Banana Pro**
(the default) had the render and the light; Seedream 4 was as dramatic but
added things (gems on the oak shield) and cropped; Nano Banana drew the
objects small. Painted from the line alone — a reference picture made
Nano Banana copy it rather than restyle it.

A line names the object, its materials and its colours, and ends with its
rarity's glow, so a tier reads at a glance like its text colour:
common = no glow (humble), uncommon = a faint cold blue sheen, epic = a
violet glow, legendary = radiating red / orange light.

```style
A single dark-fantasy game inventory icon: the object alone, centered, filling about 80% of a square frame, on a pure near-black background.
Lighting: dramatic low-key chiaroscuro — a hard cinematic key light raking from one side, a hot rim light tracing the silhouette, deep crushed black shadows, the object's own glow (gems, runes, enchantment) blooming into the dark, a little volumetric haze and a few drifting embers.
Rendering: an Unreal Engine 5 cinematic render — physically based materials, crisp specular highlights on metal, worn and scratched surfaces, glowing subsurface gems, subtle depth of field, a moody cinematic colour grade.
A touch of Mike Mignola: bold simplified graphic shapes and a few heavy solid-black shadow shapes carving the form — subtle, it stays a rendered 3D object, not a comic drawing.
No text, no frame, no border, no card, no background panel. The near-black background runs full-bleed to every edge of the image; nothing behind the object — no square, no plaque, no tile, no backing board.
```

| id | line |
|---|---|
| rusty_sword | Rusty Sword, a plain short iron sword pitted with rust, a nicked edge, a simple crossguard, a worn leather grip. Humble, common item. Shown diagonally, tip to the upper right. |
| knights_blade | Knight's Blade, a well-kept steel arming sword with a cross-shaped guard, a grip wrapped in blue leather, a brass pommel, the polished blade catching the light. Uncommon item with a faint cold blue sheen. Shown diagonally, tip to the upper right. |
| ritual_dagger | Ritual Dagger, a wavy-bladed kris dagger of dark steel, a bone handle carved with runes, a small blue gem in the pommel. Uncommon item with a faint cold blue glow along its edge. |
| executioner_axe | Executioner's Axe, a huge broad-bladed two-handed axe, a black iron head with a crescent edge, notched and stained, a long leather-wrapped haft. Epic item, a violet glow along the edge. |
| crimson_reaver | Crimson Reaver, a heavy curved falchion of dark red steel, blood-red runes glowing in the blade, blood dripping from its edge, a guard of black iron fangs. Epic item, a violet and blood-red glow. Shown diagonally, tip to the upper right. |
| moonbrand | Moonbrand, a long knightly sword, clearly enchanted: its pale silver-blue blade glowing with cold moonlight, a row of glowing violet runes down the fuller, a crossguard shaped like a crescent moon, a dark violet leather grip, a glowing moonstone pommel. Epic item, a violet glow. Shown diagonally, tip to the upper right. |
| fang_of_the_eclipse | Fang of the Eclipse, a legendary curved blade shaped like a giant black fang, an eclipse disc of black stone ringed by blood-red fire set in its guard, a corona of red flame licking along the edge. Legendary item, radiating red and orange light. |
| oak_shield | Oak Shield, a round wooden shield of oak planks bound with a dented iron rim and an iron boss, scuffed and scratched. Humble, common item. |
| plate_armor | Plate Armor, a polished steel breastplate cuirass with pauldrons and riveted lames, blue-grey leather straps. Uncommon item with a faint cold blue sheen. |
| boneplate | Boneplate, a cuirass built from bleached ribs and bones lashed together over dark leather, a small skull at the chest. Uncommon item, a faint cold blue glow in the skull's eyes. |
| crimson_plate | Crimson Plate, a knight's breastplate cuirass with pauldrons, front view: deep blood-red enamelled steel, worn gold trim and rivets, a ruby set at the chest, battle scratches. Epic item, a violet and red glow. |
| dragonscale_mail | Dragonscale Mail, a scale-mail hauberk of overlapping dark purple dragon scales edged in gold, glowing violet seams between the scales. Epic item, a violet glow. |
| bloodmoon_aegis | Bloodmoon Aegis, a legendary kite shield of black steel, a huge blood-red moon embossed on its face glowing like molten metal, sharp thorns along its rim. Legendary item, radiating red light. |
| traveler_boots | Traveler's Boots, a pair of worn brown leather walking boots with laces and mud-stained soles. Humble, common item. |
| knights_greaves | Knight's Greaves, a pair of steel plate leg greaves with knee cops and blue-grey leather straps, polished. Uncommon item with a faint cold blue sheen. |
| moonstriders | Moonstriders, a pair of elegant silver plate boots etched with crescent moons, pale moonlight glowing from the etchings, violet leather lining. Epic item, a violet glow. |
| wraithwalkers | Wraithwalkers, a pair of ghostly grey cloth-wrapped boots whose tops fade into violet ethereal mist, faintly translucent and spectral. Epic item, a violet glow. |
| umbral_treads | Umbral Treads, a pair of tall black leather knight's boots with steel greaves and silver buckles, wisps of violet shadow smoke rising from them, thin ember-orange glowing seams. Legendary item, radiating orange light. |
| ring_of_might | Ring of Might, a plain heavy bronze ring with a small engraved fist emblem. Humble, common item. |
| ring_of_protection | Ring of Protection, a silver ring set with a square blue sapphire, a tiny shield engraved on the band. Uncommon item with a faint cold blue sheen. |
| vampiric_ring | Vampiric Ring, a gold ring seen from slightly above, set with a blood-drop shaped ruby held between two small ivory fangs, a single drop of blood running down the band. Uncommon item. |
| bloodstone_band | Bloodstone Band, a thick dark iron band inlaid with a polished bloodstone — a dark green stone speckled with red. Epic item, a violet glow. |
| ring_of_the_blood_moon | Ring of the Blood Moon, a blackened silver ring holding a round glowing red moonstone with crater markings, cradled by two silver crescent prongs. Epic item, a violet and red glow. |
| ring_of_the_eclipse | Ring of the Eclipse, a black obsidian ring holding a disc of black stone ringed by a thin glowing violet-white corona. Epic item, a violet glow. |
| ring_of_the_red_veil | Ring of the Red Veil, a slender gold ring wrapped in a sheer floating veil of blood-red silk, a teardrop ruby blazing with red light. Legendary item, radiating red light. |
| signet_of_the_blood_pact | Signet of the Blood Pact, a heavy gold signet ring, its flat face engraved with two clasped hands over a drop of blood, the engraving filled with glowing molten red. Legendary item, radiating red light. |
| lucky_charm | Lucky Charm, a worn iron horseshoe tied with a faded red ribbon, a small tarnished gold coin with a four-leaf clover hanging inside it. Humble, simple, common item. |
| hunters_talisman | Hunter's Talisman, a wolf fang and a small carved bone arrowhead hung on a leather cord with blue glass beads. Uncommon item with a faint cold blue sheen. |
| fang_of_the_crimson_moon | Fang of the Crimson Moon, a large curved wolf fang capped in silver on a fine chain, a red crescent moon carved into it and glowing. Epic item, a violet and red glow. |
| relic_of_the_first_knight | Relic of the First Knight, a small ornate silver reliquary box with a glass window holding a fragment of an old knight's sword hilt, gold filigree. Epic item, a holy violet-white glow. |
| heart_of_the_dying_moon | Heart of the Dying Moon, a deep red crystal heart, cracked, a dim pale moon trapped inside it, held in a cage of black iron, red-orange light pulsing out of the cracks. Legendary item, radiating red and orange light. |
| amulet_of_vigor | Amulet of Vigor, a simple bronze pendant on a leather cord, an oak-leaf emblem with a small green stone. Humble, common item. |
| amulet_of_the_leech | Amulet of the Leech, a silver pendant shaped like a coiled leech around a small dark red gem, on a silver chain. Uncommon item with a faint cold blue sheen. |
| amulet_of_the_crimson_moon | Amulet of the Crimson Moon, a gold crescent-moon pendant cradling a round glowing crimson gem, on a gold chain. Epic item, a violet and red glow. |
| amulet_of_the_blood_moon | Amulet of the Blood Moon, a round silver locket set with a large full blood-red moonstone with craters, a single drop of blood falling from it, on a black chain. Epic item, a violet and red glow. |
| amulet_of_the_blood_eclipse | Amulet of the Blood Eclipse, an ornate gold sun-disc pendant on a gold chain, its center a black eclipse disc ringed by a blazing blood-red corona of fire, small gold rays around the rim. Legendary item, radiating intense red light — the brightest thing in the image. |

The classes' starting kits (0.00265, the developer's approval; heroes.json
`kit`): a weapon and an armor per class in its own look — the knight
keeps the Rusty Sword and the Oak Shield. Humble, common, no glow; a dull
touch of the class's colour. (The Sister's Habit was redrawn "a bit more
dramatic": hung on an iron hook in censer smoke, the third roll.)

| id | line |
|---|---|
| notched_hand_axe | Notched Hand Axe, a crude one-handed bearded axe, a chipped iron head bound to an ash haft with rawhide, rust-brown stains. Humble, common item. Shown diagonally, head to the upper right. |
| wolfhide_jerkin | Wolfhide Jerkin, a sleeveless jerkin of stitched grey wolf pelts over boiled leather, crude bone toggles, a fur collar. Humble, common item. |
| apprentices_staff | Apprentice's Staff, a plain crooked wooden walking staff, its head wrapped in worn copper wire around a dull, unlit blue stone. Humble, common item. Shown diagonally, head to the upper right. |
| threadbare_robe | Threadbare Robe, a faded deep-blue wizard's robe with a hood, frayed hems and patched elbows, a simple rope belt, laid out flat. Humble, common item. |
| grave_knife | Grave Knife, a short single-edged knife of dull iron, a handle wrapped in black cloth, a small bone pommel, a faint sickly green tarnish on the blade. Humble, common item. Shown diagonally, tip to the upper right. |
| gravediggers_shroud | Gravedigger's Shroud, a hooded black burial shroud, its hem crusted with dried grave earth, a tarnished pewter clasp, laid out flat. Humble, common item. |
| budding_branch | Budding Branch, a gnarled length of living oak used as a staff, a few small green leaves and a tuft of moss still growing on it. Humble, common item. Shown diagonally, head to the upper right. |
| bark_vest | Bark Vest, a vest of overlapping plates of oak bark laced together with green vines over a moss-green tunic. Humble, common item. |
| worn_hand_crossbow | Worn Hand Crossbow, a small one-handed crossbow of dark wood and iron, a frayed string, a scratched stock, a single bolt loaded. Humble, common item. |
| witchfinders_coat | Witchfinder's Coat, a long dark leather coat with a high collar, buckled straps and a few small tin charms sewn on, worn and scuffed, laid out flat. Humble, common item. |
| tin_censer | Tin Censer, a simple dented tin censer hanging from a short chain, a thin wisp of grey smoke curling from its vents. Humble, common item. |
| sisters_habit | Sister's Habit, a nursing sister's habit of coarse ochre-grey wool with a white wimple and a stained linen apron, laid out flat. Humble, common item. |

The healing potion (0.00263): not an item — `difficulty.json potions.art`,
on the hero card's potion count and the potion's card in combat.

| id | line |
|---|---|
| healing_potion | Healing Potion, a round-bellied glass flask stoppered with cork and red wax, filled with a glowing blood-red elixir, a frayed leather cord tied around its neck, a few drops of red on the glass. Its own warm red glow lighting the glass from inside. |

The item matrix (0.00273, docs/item-matrix.md): every class's weapon kinds
and armor weight at tiers 2–4, and each class's two signature items (a
tier-3 and a tier-4 accessory that feeds its mechanic — named for the
class, in its colours).

| id | line |
|---|---|
| silvered_shortsword | Silvered Shortsword, a short straight witch-hunter's sword with a bright silvered blade etched with small protective sigils, a simple black iron crossguard, a leather-wrapped grip. Uncommon item with a faint cold blue sheen. Shown diagonally, tip to the upper right. |
| bearded_war_axe | Bearded War Axe, a one-handed northern war axe with a long hooked 'bearded' iron blade, a thick ash haft bound in leather and wolf fur. Uncommon item with a faint cold blue sheen. Shown diagonally, head to the upper right. |
| flanged_mace | Flanged Mace, a heavy iron mace with a head of seven sharp radiating flanges on a riveted steel shaft, a leather grip. Uncommon item with a faint cold blue sheen. Shown diagonally, head to the upper right. |
| ashwood_staff | Ashwood Staff, a tall straight staff of pale ash wood, its head carved into an open hand cradling a small glowing blue crystal, bands of silver. Uncommon item with a faint cold blue glow. Shown diagonally, head to the upper right. |
| harvest_sickle | Harvest Sickle, a curved crescent sickle of dark old iron with a worn wooden handle wrapped in twine, a few stalks of dried wheat tied to it. Uncommon item with a faint cold blue sheen. |
| silverbolt_crossbow | Silverbolt Crossbow, a compact hunter's crossbow of dark oiled wood with steel limbs, loaded with a gleaming silver-tipped bolt. Uncommon item with a faint cold blue sheen. |
| brass_thurible | Brass Thurible, a round brass church censer hanging from three short chains, pale smoke curling from its pierced lid, a little worn and dented. Uncommon item with a faint cold blue sheen. |
| wolfjaw_cleaver | Wolfjaw Cleaver, a brutal two-handed cleaver axe whose blade edge is set with a row of real wolf teeth, a bone handle bound in red leather. Epic item, a violet glow. Shown diagonally, head to the upper right. |
| bonecrusher_maul | Bonecrusher Maul, a massive two-handed war hammer with a blocky black iron head studded with spikes, a long iron-banded haft. Epic item, a violet glow. Shown diagonally, head to the upper right. |
| stormcaller_staff | Stormcaller Staff, a twisted black staff whose head is a cage of iron prongs holding a crackling violet lightning orb, small arcs of lightning around it. Epic item, a violet glow. Shown diagonally, head to the upper right. |
| athame_of_ash | Athame of Ash, a slim double-edged ritual dagger of dark grey metal with a black handle carved with occult sigils, wisps of grey ash curling off the blade. Epic item, a violet glow. Shown diagonally, tip to the upper right. |
| reapers_scythe | Reaper's Scythe, a great two-handed war scythe with a long curved black blade on a crooked dark wood snath bound with chains and a small skull. Epic item, a violet glow. |
| witchbane_arbalest | Witchbane Arbalest, a heavy steel arbalest crossbow with a crank, its stock carved with holy sigils, a silver bolt glowing faintly. Epic item, a violet glow. |
| censer_of_ashen_mercy | Censer of Ashen Mercy, an ornate silver censer on a long chain, shaped like a small cathedral, thick grey-violet smoke pouring from its windows. Epic item, a violet glow. |
| moonsplitter | Moonsplitter, a legendary huge double-bladed great axe of black steel, its two crescent blades glowing molten red along the edges like a blood moon, a long haft wrapped in dark fur. Legendary item, radiating red light. Shown diagonally. |
| hammer_of_the_last_vigil | Hammer of the Last Vigil, a legendary holy war hammer of dark steel and gold, its head shaped like a small chapel with a burning red window, fiery red light pouring out. Legendary item, radiating red light. Shown diagonally. |
| staff_of_the_pale_moon | Staff of the Pale Moon, a legendary tall staff of white bone-like wood whose head holds a floating blood-red full moon orb inside a silver crescent, red light radiating. Legendary item, radiating red light. Shown diagonally. |
| bloodletters_kris | Bloodletter's Kris, a legendary wavy-bladed kris dagger of dark red steel, blood running in channels along the blade and dripping from its tip, a black and gold handle. Legendary item, radiating red light. |
| scythe_of_the_dying_moon | Scythe of the Dying Moon, a legendary great scythe whose huge blade is a pale curved crescent moon cracked and bleeding red light, on a black bone snath. Legendary item, radiating red light. |
| eclipse_repeater | Eclipse Repeater, a legendary black repeating crossbow with a magazine of red-glowing bolts on top, an eclipse disc ringed by red fire set in its stock. Legendary item, radiating red light. |
| thurible_of_the_black_abbey | Thurible of the Black Abbey, a legendary black iron censer on a heavy chain, shaped like a small ruined abbey, blood-red smoke and embers pouring from it. Legendary item, radiating red and orange light. |
| riveted_hauberk | Riveted Hauberk, a knee-length coat of riveted steel chainmail with short sleeves, leather-trimmed collar, laid out flat. Uncommon item with a faint cold blue sheen. |
| studded_leather | Studded Leather, a hunter's vest of dark boiled leather covered in rows of steel studs, buckled straps at the sides. Uncommon item with a faint cold blue sheen. |
| scholars_robe | Scholar's Robe, a deep blue hooded wizard's robe embroidered with small silver stars and runes at the hems and cuffs, a book-belt at the waist, laid out flat. Uncommon item with a faint cold blue glow in the embroidery. |
| ashen_vestments | Ashen Vestments, ash-grey occult vestments with a high collar and long ragged sleeves, a black sash stitched with faded sigils, laid out flat. Uncommon item with a faint cold blue sheen. |
| bearhide_mantle | Bearhide Mantle, a heavy mantle of thick brown bear fur with the bear's head as a hood, leather straps and bone toggles, laid out. Epic item, a violet glow in the bear's eyes. |
| shadowstalker_leathers | Shadowstalker Leathers, a sleek dark leather hunter's armor with a hood and many small buckles, wisps of violet shadow clinging to it. Epic item, a violet glow. |
| robe_of_starlit_thread | Robe of Starlit Thread, a midnight-black wizard's robe whose fabric is woven with tiny glowing violet stars and constellations, a high collar, laid out flat. Epic item, a violet glow. |
| bloodsilk_vestments | Bloodsilk Vestments, flowing dark crimson silk vestments of an occult priest, a black stole embroidered with violet runes, laid out flat. Epic item, a violet and red glow. |
| eclipse_mail | Eclipse Mail, a legendary full suit of black plate and mail armor, an eclipse disc ringed by blood-red fire on the breastplate, red light glowing in the joints. Legendary item, radiating red light. |
| hide_of_the_moon_wolf | Hide of the Moon-Wolf, a legendary armor made from a giant silver-black wolf's pelt, the wolf's head as a hood with glowing red eyes, a red crescent moon branded on the chest. Legendary item, radiating red light. |
| mantle_of_the_crimson_moon | Mantle of the Crimson Moon, a legendary flowing hooded robe of deep crimson velvet embroidered in gold with a great full blood moon on its back, red light glowing from the embroidery. Legendary item, radiating red light. |
| hobnailed_boots | Hobnailed Boots, a pair of sturdy dark leather marching boots with iron hobnails in the soles and buckled shin straps. Uncommon item with a faint cold blue sheen. |
| warchiefs_torc | Warchief's Torc, a heavy twisted iron neck torc ending in two snarling wolf heads, hung with a few bear claws. A barbarian's. Epic item, a violet glow. |
| chained_grimoire | Chained Grimoire, a small thick leather-bound spellbook clasped shut with an iron lock and hung on a chain, glowing violet runes leaking from between its pages. A wizard's. Epic item, a violet glow. |
| necromancers_phylactery | Necromancer's Phylactery, a small ornate silver vial on a chain holding a swirling trapped green-violet soul, a tiny skull for a stopper. A necromancer's. Epic item, a violet glow. |
| druids_antler_totem | Druid's Antler Totem, a small totem of a stag's antler bound with green vines, feathers and moss, a tiny glowing green leaf at its centre. A druid's. Epic item, a violet glow. |
| witchfinders_signet | Witchfinder's Signet, a heavy silver signet ring engraved with an eye inside a pentacle crossed by a stake, a witch hunter's seal. Epic item, a violet glow. |
| abbey_reliquary | Abbey Reliquary, a small gilded reliquary box on a chain with a tiny glass window holding a saint's bone, ochre and gold, faint holy smoke. A nursing sister's. Epic item, a violet glow. |
| knight_commanders_seal | Knight-Commander's Seal, a legendary heavy gold medallion on a chain, a sword and crown engraved on it, a blood-red ruby at its centre blazing with light. A knight's. Legendary item, radiating red light. |
| warlords_skull_totem | Warlord's Skull Totem, a legendary horned beast skull painted with red war paint, hung with braids, iron rings and teeth, red light glowing from its eye sockets. A barbarian's. Legendary item, radiating red light. |
| archmages_starstone | Archmage's Starstone, a legendary pendant holding a faceted star-shaped crystal with a tiny red galaxy swirling inside, set in an ornate silver frame. A wizard's. Legendary item, radiating red light. |
| ring_of_the_thrall_lord | Ring of the Thrall-Lord, a legendary black bone ring carved as a circle of tiny clutching skeletal hands holding a glowing red soul-gem. A necromancer's. Legendary item, radiating red light. |
| heartwood_of_the_elder_grove | Heartwood of the Elder Grove, a legendary pendant of ancient dark heartwood shaped like a heart, roots and tiny leaves growing from it, a red-amber sap glowing in its veins. A druid's. Legendary item, radiating red and orange light. |
| grand_inquisitors_badge | Grand Inquisitor's Badge, a legendary iron and gold badge shaped like a flaming eye over crossed stakes, red fire burning in the eye. A witch hunter's. Legendary item, radiating red light. |
| black_abbess_rosary | Black Abbess's Rosary, a legendary rosary of black beads and small bone skulls ending in an ornate iron censer-cross, red embers glowing in it. A plague nun's. Legendary item, radiating red and orange light. |
