# Item matrix — who can wear what

**Shipped in 0.00273** with the developer's calls on the open questions:
one armor weight per class (Heavy = plate and mail, the Knight's;
Leather & Hide = the Barbarian, the Druid, the Hexhunter; Cloth = the
Wizard, the Necromancer, the Plague Sister); axes the Barbarian's alone;
maces shared by three; a save's gear the class can't use becomes its kit
(no payout); a class's two signature items feed its mechanic, +1 at
tier 3 and +2 at tier 4; plate clearly stronger than cloth; another
class's gear still drops and is salvaged at the run's end ("Can't use ·
salvaged"), 80% of the drops rolled from the class's own pool
(`difficulty.json classDropShare`). The data is the truth now
(`items.json kind / class / mastery`, `heroes.json wields / wears /
mastery`); the tables below are the proposal as discussed — where they
differ, the data wins (Mail folded into Heavy; cloth's HP raised after
the simulator: the least armor, the most HP; the signature items
reworked into a tier-3 and a tier-4 accessory per class).

Nothing here is in the game yet. Stats use the current scale (tier-1 kits:
6 dmg / 40 armor + 80 HP; the 0.00259 rule that the weapon carries the
damage and the body armor the armor and HP stays). **New** marks an item
that does not exist yet; everything else is today's item, reclassified.

## 1. The rule

Three layers, so a player can read who an item is for from its name and
picture alone:

1. **Weapons and body armor have a kind.** A class wields two weapon
   kinds and wears one or two armor weights. The kind is visible in the
   name ("…Plate", "…Robe", "…Crossbow").
2. **An item named after a class is that class's alone,** whatever its
   kind: Knight's Blade, Knight's Greaves, Relic of the First Knight,
   Gravedigger's Shroud, the starting kits, one signature accessory per
   class.
3. **Everything else is for everyone:** boots, rings, trinkets and
   amulets, unless a rule 2 name says otherwise.

### Weapon kinds

| Kind | Who | Feel (the stat beside damage) |
|---|---|---|
| Sword | Knight, Hexhunter | balanced: damage + some crit |
| Axe | Barbarian | the most raw damage, nothing else |
| Mace & Hammer | Knight, Barbarian, Plague Sister | damage + armor |
| Staff | Wizard, Druid | damage + crit |
| Dagger | Wizard, Necromancer | less damage, big crit |
| Sickle & Scythe | Necromancer, Druid | damage + lifesteal |
| Crossbow | Hexhunter | damage + high crit |
| Censer | Plague Sister | damage + lifesteal |

### Armor weights

| Weight | Who | Feel |
|---|---|---|
| Plate | Knight | the most armor |
| Mail | Knight, Hexhunter, Plague Sister | armor and HP balanced |
| Leather & Hide | Barbarian, Druid, Hexhunter | more HP, some dodge |
| Cloth (robes, shrouds, habits) | Wizard, Necromancer, Plague Sister | the least armor, the most HP, a secondary (crit or lifesteal) |

### Per class

| Class | Weapons | Armor | Signature (named) items |
|---|---|---|---|
| Knight | Sword, Mace | Plate, Mail | Knight's Blade, Knight's Greaves, Relic of the First Knight |
| Barbarian | Axe, Mace | Leather & Hide | Warchief's Torc |
| Wizard | Staff, Dagger | Cloth | Chained Grimoire |
| Necromancer | Dagger, Scythe | Cloth | Phylactery, (kit) Gravedigger's Shroud |
| Druid | Staff, Scythe | Leather & Hide | Antler Totem |
| Hexhunter | Crossbow, Sword | Leather & Hide, Mail | Witchfinder's Signet |
| Plague Sister | Censer, Mace | Cloth, Mail | Abbey Reliquary |

Every class gets at least two weapons and at least one armor at each of
tiers 2–4 (counts in §5), so no class's ladder has a gap.

## 2. Weapons

| T | Item | Kind | Who | Stats |
|---|---|---|---|---|
| 1 | Rusty Sword | Sword | Knight (kit) | 6 dmg |
| 1 | Notched Hand Axe · Apprentice's Staff · Grave Knife · Budding Branch · Worn Hand Crossbow · Tin Censer | — | their class (kit) | 6 dmg |
| 2 | Knight's Blade | Sword | **Knight** | 14 dmg |
| 2 | Silvered Shortsword **new** | Sword | Knight, Hexhunter | 11 dmg, 8% crit |
| 2 | Bearded War Axe **new** | Axe | Barbarian | 16 dmg |
| 2 | Flanged Mace **new** | Mace | Knight, Barbarian, Plague Sister | 12 dmg, 20 armor |
| 2 | Ashwood Staff **new** | Staff | Wizard, Druid | 12 dmg, 6% crit |
| 2 | Ritual Dagger | Dagger | Wizard, Necromancer | 9 dmg, 10% crit |
| 2 | Harvest Sickle **new** | Sickle | Necromancer, Druid | 11 dmg, 25% lifesteal |
| 2 | Silverbolt Crossbow **new** | Crossbow | Hexhunter | 12 dmg, 8% crit |
| 2 | Brass Thurible **new** | Censer | Plague Sister | 11 dmg, 20% lifesteal |
| 3 | Moonbrand | Sword | Knight, Hexhunter | 21 dmg, 10% crit |
| 3 | Crimson Reaver | Sword | Knight, Hexhunter | 18 dmg, 50% lifesteal |
| 3 | Executioner's Axe | Axe | Barbarian | 24 dmg |
| 3 | Wolfjaw Cleaver **new** | Axe | Barbarian | 20 dmg, 30% lifesteal |
| 3 | Bonecrusher Maul **new** | Mace | Knight, Barbarian, Plague Sister | 20 dmg, 35 armor |
| 3 | Stormcaller Staff **new** | Staff | Wizard, Druid | 19 dmg, 10% crit |
| 3 | Athame of Ash **new** | Dagger | Wizard, Necromancer | 15 dmg, 15% crit |
| 3 | Reaper's Scythe **new** | Scythe | Necromancer, Druid | 18 dmg, 50% lifesteal |
| 3 | Witchbane Arbalest **new** | Crossbow | Hexhunter | 20 dmg, 12% crit |
| 3 | Censer of Ashen Mercy **new** | Censer | Plague Sister | 18 dmg, 40% lifesteal |
| 4 | Fang of the Eclipse | Sword | Knight, Hexhunter | 24 dmg, 10% crit, faster heavy |
| 4 | Moonsplitter **new** | Axe | Barbarian | 32 dmg, faster heavy |
| 4 | Hammer of the Last Vigil **new** | Mace | Knight, Barbarian, Plague Sister | 26 dmg, 50 armor, 4 thorns |
| 4 | Staff of the Pale Moon **new** | Staff | Wizard, Druid | 25 dmg, 12% crit, faster heavy |
| 4 | Bloodletter's Kris **new** | Dagger | Wizard, Necromancer | 18 dmg, 15% crit, 40% lifesteal |
| 4 | Scythe of the Dying Moon **new** | Scythe | Necromancer, Druid | 24 dmg, 80% lifesteal |
| 4 | Eclipse Repeater **new** | Crossbow | Hexhunter | 25 dmg, 15% crit, faster heavy |
| 4 | Thurible of the Black Abbey **new** | Censer | Plague Sister | 24 dmg, 60% lifesteal, 4 thorns |

## 3. Body armor

| T | Item | Weight | Who | Stats |
|---|---|---|---|---|
| 1 | Oak Shield | (shield) | Knight (kit) | 40 armor, 80 HP |
| 1 | Wolfhide Jerkin · Threadbare Robe · Gravedigger's Shroud · Bark Vest · Witchfinder's Coat · Sister's Habit | — | their class (kit) | 40 armor, 80 HP |
| 2 | Plate Armor | Plate | Knight | 110 armor, 130 HP |
| 2 | Riveted Hauberk **new** | Mail | Knight, Hexhunter, Plague Sister | 95 armor, 170 HP |
| 2 | Boneplate | Hide | Barbarian, Druid, Hexhunter | 85 armor, 230 HP |
| 2 | Studded Leather **new** | Leather | Barbarian, Druid, Hexhunter | 80 armor, 200 HP, 4% dodge |
| 2 | Scholar's Robe **new** | Cloth | Wizard, Necromancer, Plague Sister | 55 armor, 250 HP, 6% crit |
| 2 | Ashen Vestments **new** | Cloth | Wizard, Necromancer, Plague Sister | 60 armor, 240 HP, 15% lifesteal |
| 3 | Crimson Plate | Plate | Knight | 155 armor, 360 HP |
| 3 | Dragonscale Mail | Mail | Knight, Hexhunter, Plague Sister | 195 armor, 180 HP |
| 3 | Bearhide Mantle **new** | Hide | Barbarian, Druid, Hexhunter | 130 armor, 380 HP |
| 3 | Shadowstalker Leathers **new** | Leather | Barbarian, Druid, Hexhunter | 120 armor, 300 HP, 6% dodge |
| 3 | Robe of Starlit Thread **new** | Cloth | Wizard, Necromancer, Plague Sister | 95 armor, 380 HP, 8% crit |
| 3 | Bloodsilk Vestments **new** | Cloth | Wizard, Necromancer, Plague Sister | 100 armor, 360 HP, 30% lifesteal |
| 4 | Bloodmoon Aegis | Plate (a shield) | Knight | 225 armor, 420 HP, 4 thorns |
| 4 | Eclipse Mail **new** | Mail | Knight, Hexhunter, Plague Sister | 230 armor, 340 HP |
| 4 | Hide of the Moon-Wolf **new** | Hide | Barbarian, Druid, Hexhunter | 170 armor, 480 HP, 8% dodge |
| 4 | Mantle of the Crimson Moon **new** | Cloth | Wizard, Necromancer, Plague Sister | 140 armor, 520 HP, 50% lifesteal |

## 4. Accessories — everyone's, except the named ones

Boots, rings, trinkets and amulets stay universal: they are where a build
gets its crit, lifesteal and dodge, and a class matrix there would mostly
shrink each pool. The exceptions:

| T | Item | Slot | Who | Stats |
|---|---|---|---|---|
| 2 | Knight's Greaves | Boots | **Knight** | 6 armor, 30 HP |
| 2 | Hobnailed Boots **new** | Boots | everyone | 6 armor, 30 HP (fills the gap the Greaves leave) |
| 3 | Relic of the First Knight | Trinket | **Knight** | 2 dmg, 10 armor, 40 HP |
| 3 | Warchief's Torc **new** | Amulet | **Barbarian** | 3 dmg, 40 HP |
| 3 | Chained Grimoire **new** | Trinket | **Wizard** | 2 dmg, 10% crit |
| 3 | Phylactery **new** | Amulet | **Necromancer** | 50% lifesteal, 40 HP |
| 3 | Antler Totem **new** | Trinket | **Druid** | 10 armor, 50 HP |
| 3 | Witchfinder's Signet **new** | Ring | **Hexhunter** | 8% crit, 4% dodge |
| 3 | Abbey Reliquary **new** | Trinket | **Plague Sister** | 15 armor, 50 HP, 2 thorns |

Unchanged and universal: Traveler's Boots, Moonstriders, Wraithwalkers,
Umbral Treads; all eight rings; Lucky Charm, Hunter's Talisman, Fang of
the Crimson Moon, Heart of the Dying Moon; all five amulets.

Later, if wanted: each signature item could feed its class's own
mechanic instead of a plain stat (the Grimoire +1 Fireball charge, the
Phylactery a bigger thrall share, the Antler Totem more mending, the
Torc more rage). That needs code, so I've kept them to existing stats here.

## 5. Coverage check

Weapons wieldable per tier (T2 / T3 / T4), counting shared kinds:

| Class | T2 | T3 | T4 |
|---|---|---|---|
| Knight | 3 | 3 | 2 |
| Barbarian | 2 | 3 | 2 |
| Wizard | 2 | 2 | 2 |
| Necromancer | 2 | 2 | 2 |
| Druid | 2 | 2 | 2 |
| Hexhunter | 2 | 3 | 2 |
| Plague Sister | 2 | 2 | 2 |

Body armor wearable per tier:

| Class | T2 | T3 | T4 |
|---|---|---|---|
| Knight | 2 | 2 | 2 |
| Barbarian / Druid | 2 | 2 | 1 |
| Wizard / Necromancer | 2 | 2 | 1 |
| Hexhunter / Plague Sister | 3 | 3 | 2 |

Totals: 48 items today, 39 new, 87 in all (34 weapons incl. 7 kits,
23 body armors incl. 7 kits, 30 accessories).

## 6. What the game would do with it

- **Data:** `kind` on every weapon and body armor; per class in
  heroes.json `wields: [...]` and `wears: [...]`; `class: "<id>"` on the
  named items. No field means everyone.
- **Drops:** a class only rolls items it can use (the kill pool, the
  gilded chest, the reliquary's relic), so nothing unusable drops and
  nothing is wasted.
- **UI:** the find card, the run-end card and the hall's slot show who
  an item is for in small print under its name ("Plate · Knight",
  "Cloth · Wizard, Necromancer, Plague Sister", "Everyone").
- **Existing saves:** a worn item the class can't use (a Wizard in Plate
  Armor, after the debug SWITCH CLASS too) needs a rule; see the open
  questions.
- **Balance:** the drop pools change per class, so the simulator has to
  run per class afterwards. Cloth on top of the Wizard's armor ×0.7 is a
  double cut, which is intended ("frail"), but the class multipliers may
  need a pass.

## 7. Open questions

1. **Mail for the Plague Sister** (a nun under chain) and **for the
   Hexhunter**: or keep each to one weight like the others?
2. **Axes for the Knight?** Here only the Barbarian swings axes, so
   Executioner's Axe moves to him.
3. **Maces shared by three** (Knight, Barbarian, Plague Sister): too wide,
   or good for variety?
4. **A worn item the class can't use** on an old save: (a) keep it worn
   until something better replaces it, (b) swap it for the class's kit
   and pay its salvage value, or (c) keep it but give it no effect.
   I'd pick (b).
5. **Signature accessories:** plain stats now, or class-mechanic effects
   from the start?
6. **Equal stat budgets per tier:** this proposal keeps every kind at
   roughly the same value per tier and leaves the class multipliers to
   make the classes differ. Or should kinds be uneven too (plate clearly
   strongest, cloth clearly weakest)?
