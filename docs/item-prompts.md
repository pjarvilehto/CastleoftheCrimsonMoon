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
