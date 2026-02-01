# Asset Inventory — What Needs to Be Generated

## Quick Stats

| | Exist | Need to Generate |
|---|---|---|
| 3D Models | 80 files | **~200 items** |
| Icons | 0 files | **~152 files** |
| Audio SFX | 12 files | **~30+ effects** |

---

## P0 — Broken References (files are expected but don't exist)

These are referenced in manifests and will cause load errors:

- [ ] `models/cow/cow.vrm` — Cow mob model (referenced in `npcs.json`)
- [ ] `models/ore-iron/iron.glb` — Iron rock (referenced in `gathering/mining.json`)
- [ ] `models/ore-coal/coal.glb` — Coal rock (referenced in `gathering/mining.json`)

---

## P1 — Icons (entire system is broken)

**The `icons/` directory does not exist.** Every single `asset://icons/` reference in every manifest resolves to nothing. All icons below need to be generated as PNGs.

### NPC Icons — `icons/npcs/` (9 files)

- [ ] `goblin.png`
- [ ] `cow.png`
- [ ] `shopkeeper.png`
- [ ] `captain.png`
- [ ] `forester.png`
- [ ] `fisherman.png`
- [ ] `smith.png`
- [ ] `tanner.png`
- [ ] `duel_arena_nurse.png`

### Weapon Icons — `icons/` (33 files)

- [ ] `sword-iron.png`
- [ ] `sword-adamant.png`
- [ ] `sword-rune.png`
- [ ] `staff.png`
- [ ] `magic-staff.png`
- [ ] `staff-of-air.png`
- [ ] `staff-of-water.png`
- [ ] `staff-of-earth.png`
- [ ] `staff-of-fire.png`
- [ ] `shortbow.png`
- [ ] `longbow.png`
- [ ] `oak-shortbow.png`
- [ ] `oak-longbow.png`
- [ ] `willow-shortbow.png`
- [ ] `willow-longbow.png`
- [ ] `maple-shortbow.png`
- [ ] `maple-longbow.png`
- [ ] `yew-shortbow.png`
- [ ] `yew-longbow.png`
- [ ] `magic-shortbow.png`
- [ ] `magic-longbow.png`
- [ ] `shortbow-u.png`
- [ ] `longbow-u.png`
- [ ] `oak-shortbow-u.png`
- [ ] `oak-longbow-u.png`
- [ ] `willow-shortbow-u.png`
- [ ] `willow-longbow-u.png`
- [ ] `maple-shortbow-u.png`
- [ ] `maple-longbow-u.png`
- [ ] `yew-shortbow-u.png`
- [ ] `yew-longbow-u.png`
- [ ] `magic-shortbow-u.png`
- [ ] `magic-longbow-u.png`

### Tool Icons — `icons/` (21 files)

- [ ] `hatchet-iron.png`
- [ ] `hatchet-steel.png`
- [ ] `hatchet-mithril.png`
- [ ] `hatchet-adamant.png`
- [ ] `hatchet-rune.png`
- [ ] `pickaxe-iron.png`
- [ ] `pickaxe-steel.png`
- [ ] `pickaxe-mithril.png`
- [ ] `pickaxe-adamant.png`
- [ ] `pickaxe-rune.png`
- [ ] `hammer.png`
- [ ] `tools.png` (tinderbox)
- [ ] `small-fishing-net.png`
- [ ] `harpoon.png`
- [ ] `lobster-pot.png`
- [ ] `needle.png`
- [ ] `thread.png`
- [ ] `chisel.png`
- [ ] `knife.png`
- [ ] `ring-mould.png`
- [ ] `amulet-mould.png`

### Ore & Bar Icons — `icons/` (17 files)

- [ ] `ore-copper.png`
- [ ] `ore-tin.png`
- [ ] `ore-iron.png`
- [ ] `coal.png`
- [ ] `ore-mithril.png`
- [ ] `ore-adamant.png`
- [ ] `ore-rune.png`
- [ ] `bar-bronze.png`
- [ ] `bar-iron.png`
- [ ] `bar-steel.png`
- [ ] `bar-mithril.png`
- [ ] `bar-adamant.png`
- [ ] `bar-rune.png`
- [ ] `bar-gold.png`

### Fish Icons — `icons/` (25 files)

- [ ] `raw-shrimp.png`
- [ ] `raw-anchovies.png`
- [ ] `raw-sardine.png`
- [ ] `raw-herring.png`
- [ ] `raw-trout.png`
- [ ] `raw-pike.png`
- [ ] `raw-salmon.png`
- [ ] `raw-tuna.png`
- [ ] `raw-lobster.png`
- [ ] `raw-swordfish.png`
- [ ] `raw-monkfish.png`
- [ ] `raw-shark.png`
- [ ] `shrimp.png`
- [ ] `anchovies.png`
- [ ] `sardine.png`
- [ ] `herring.png`
- [ ] `trout.png`
- [ ] `pike.png`
- [ ] `salmon.png`
- [ ] `tuna.png`
- [ ] `lobster.png`
- [ ] `swordfish.png`
- [ ] `monkfish.png`
- [ ] `shark.png`
- [ ] `burnt-fish.png`

### Log Icons — `icons/` (6 files)

- [ ] `willow-logs.png`
- [ ] `teak-logs.png`
- [ ] `maple-logs.png`
- [ ] `mahogany-logs.png`
- [ ] `yew-logs.png`
- [ ] `magic-logs.png`

### Gem Icons — `icons/` (12 files)

- [ ] `uncut-sapphire.png`
- [ ] `uncut-emerald.png`
- [ ] `uncut-ruby.png`
- [ ] `uncut-diamond.png`
- [ ] `uncut-dragonstone.png`
- [ ] `uncut-onyx.png`
- [ ] `sapphire.png`
- [ ] `emerald.png`
- [ ] `ruby.png`
- [ ] `diamond.png`
- [ ] `dragonstone.png`
- [ ] `onyx.png`

### Rune & Essence Icons — `icons/` (8 files)

- [ ] `air-rune.png`
- [ ] `water-rune.png`
- [ ] `earth-rune.png`
- [ ] `fire-rune.png`
- [ ] `mind-rune.png`
- [ ] `chaos-rune.png`
- [ ] `rune-essence.png`
- [ ] `pure-essence.png`

### Ammunition & Fletching Icons — `icons/` (16 files)

- [ ] `bronze-arrow.png`
- [ ] `iron-arrow.png`
- [ ] `steel-arrow.png`
- [ ] `mithril-arrow.png`
- [ ] `adamant-arrow.png`
- [ ] `rune-arrow.png`
- [ ] `bronze-arrowtips.png`
- [ ] `iron-arrowtips.png`
- [ ] `steel-arrowtips.png`
- [ ] `mithril-arrowtips.png`
- [ ] `adamant-arrowtips.png`
- [ ] `rune-arrowtips.png`
- [ ] `arrow-shaft.png`
- [ ] `headless-arrow.png`
- [ ] `bowstring.png`
- [ ] `steel-studs.png`

### Misc Icons — `icons/` (9 files)

- [ ] `bones.png`
- [ ] `big-bones.png`
- [ ] `dragon-bones.png`
- [ ] `cowhide.png`
- [ ] `leather.png`
- [ ] `green-dragonhide.png`
- [ ] `green-dragon-leather.png`
- [ ] `fishing-bait.png`
- [ ] `feathers.png`

### Other Icons — `icons/` (3 files)

- [ ] `coins.png`
- [ ] `ashes.png`
- [ ] `xp-lamp.png`

---

## P2 — Missing 3D Models for Equippable Items

Players can equip these items but they render as placeholder cubes.

### Swords (3 models needed — ground + equipped each)

- [ ] `sword-iron/sword-iron.glb` + `sword-iron-aligned.glb`
- [ ] `sword-adamant/sword-adamant.glb` + `sword-adamant-aligned.glb`
- [ ] `sword-rune/sword-rune.glb` + `sword-rune-aligned.glb`

### Hatchets (5 models)

- [ ] `hatchet-iron/hatchet-iron.glb` + aligned
- [ ] `hatchet-steel/hatchet-steel.glb` + aligned
- [ ] `hatchet-mithril/hatchet-mithril.glb` + aligned
- [ ] `hatchet-adamant/hatchet-adamant.glb` + aligned
- [ ] `hatchet-rune/hatchet-rune.glb` + aligned

### Pickaxes (3 models)

- [ ] `pickaxe-iron/pickaxe-iron.glb` + aligned
- [ ] `pickaxe-adamant/pickaxe-adamant.glb` + aligned
- [ ] `pickaxe-rune/pickaxe-rune.glb` + aligned

### Staves (6 models)

- [ ] `staff/staff.glb`
- [ ] `magic-staff/magic-staff.glb`
- [ ] `staff-of-air/staff-of-air.glb`
- [ ] `staff-of-water/staff-of-water.glb`
- [ ] `staff-of-earth/staff-of-earth.glb`
- [ ] `staff-of-fire/staff-of-fire.glb`

### Bows (12 strung + 12 unstrung = 24 models)

Note: 4 bow `.glb` files already exist on disk (`bow-base`, `bow-oak`, `bow-willow`, `bow-wood`) but aren't linked in manifests.

- [ ] `shortbow/shortbow.glb`
- [ ] `longbow/longbow.glb`
- [ ] `oak-shortbow/oak-shortbow.glb`
- [ ] `oak-longbow/oak-longbow.glb`
- [ ] `willow-shortbow/willow-shortbow.glb`
- [ ] `willow-longbow/willow-longbow.glb`
- [ ] `maple-shortbow/maple-shortbow.glb`
- [ ] `maple-longbow/maple-longbow.glb`
- [ ] `yew-shortbow/yew-shortbow.glb`
- [ ] `yew-longbow/yew-longbow.glb`
- [ ] `magic-shortbow/magic-shortbow.glb`
- [ ] `magic-longbow/magic-longbow.glb`
- [ ] Plus 12 unstrung variants (`*-u.glb`)

### Armor — ALL 54 items have no model at all

**Helmets (6):**
- [ ] `full-helm-bronze.glb`
- [ ] `full-helm-iron.glb`
- [ ] `full-helm-steel.glb`
- [ ] `full-helm-mithril.glb`
- [ ] `full-helm-adamant.glb`
- [ ] `full-helm-rune.glb`

**Platebodies (6):**
- [ ] `platebody-bronze.glb`
- [ ] `platebody-iron.glb`
- [ ] `platebody-steel.glb`
- [ ] `platebody-mithril.glb`
- [ ] `platebody-adamant.glb`
- [ ] `platebody-rune.glb`

**Platelegs (6):**
- [ ] `platelegs-bronze.glb`
- [ ] `platelegs-iron.glb`
- [ ] `platelegs-steel.glb`
- [ ] `platelegs-mithril.glb`
- [ ] `platelegs-adamant.glb`
- [ ] `platelegs-rune.glb`

**Kiteshields (6):**
- [ ] `kiteshield-bronze.glb`
- [ ] `kiteshield-iron.glb`
- [ ] `kiteshield-steel.glb`
- [ ] `kiteshield-mithril.glb`
- [ ] `kiteshield-adamant.glb`
- [ ] `kiteshield-rune.glb`

**Boots (6):**
- [ ] `boots-bronze.glb` through `boots-rune.glb`

**Gloves (6):**
- [ ] `gloves-bronze.glb` through `gloves-rune.glb`

**Leather Set (7):**
- [ ] `leather-gloves.glb`
- [ ] `leather-boots.glb`
- [ ] `leather-cowl.glb`
- [ ] `leather-vambraces.glb`
- [ ] `leather-body.glb`
- [ ] `leather-chaps.glb`
- [ ] `coif.glb`

**Studded Set (2):**
- [ ] `studded-body.glb`
- [ ] `studded-chaps.glb`

**Green D'hide Set (3):**
- [ ] `green-dhide-vambraces.glb`
- [ ] `green-dhide-chaps.glb`
- [ ] `green-dhide-body.glb`

**Wizard Set (2):**
- [ ] `wizard-hat.glb`
- [ ] `wizard-robe.glb`

**Mystic Set (3):**
- [ ] `mystic-hat.glb`
- [ ] `mystic-robe-top.glb`
- [ ] `mystic-robe-bottom.glb`

**Accessories (5):**
- [ ] `cape.glb`
- [ ] `amulet-of-accuracy.glb`
- [ ] `amulet-of-power.glb`
- [ ] `gold-ring.glb`
- [ ] `gold-amulet.glb`

---

## P3 — Missing 3D Models for Non-Equippable Items

These show as placeholder cubes when dropped on the ground or viewed in inventory 3D preview.

### Food (12 models)

- [ ] `shrimp.glb`
- [ ] `anchovies.glb`
- [ ] `sardine.glb`
- [ ] `herring.glb`
- [ ] `trout.glb`
- [ ] `pike.glb`
- [ ] `salmon.glb`
- [ ] `tuna.glb`
- [ ] `lobster.glb`
- [ ] `swordfish.glb`
- [ ] `monkfish.glb`
- [ ] `shark.glb`

### Runes (6 models)

- [ ] `air-rune.glb`
- [ ] `water-rune.glb`
- [ ] `earth-rune.glb`
- [ ] `fire-rune.glb`
- [ ] `mind-rune.glb`
- [ ] `chaos-rune.glb`

### Ammunition (6 models)

- [ ] `iron-arrow.glb`
- [ ] `steel-arrow.glb`
- [ ] `mithril-arrow.glb`
- [ ] `adamant-arrow.glb`
- [ ] `rune-arrow.glb`
- [ ] `arrow-shaft.glb`

### Resources — Ores (7 models)

- [ ] `copper-ore.glb`
- [ ] `tin-ore.glb`
- [ ] `iron-ore.glb`
- [ ] `coal.glb`
- [ ] `mithril-ore.glb`
- [ ] `adamant-ore.glb`
- [ ] `rune-ore.glb`

### Resources — Bars (7 models)

- [ ] `bronze-bar.glb`
- [ ] `iron-bar.glb`
- [ ] `steel-bar.glb`
- [ ] `mithril-bar.glb`
- [ ] `adamant-bar.glb`
- [ ] `rune-bar.glb`
- [ ] `gold-bar.glb`

### Resources — Raw Fish (12 models)

- [ ] `raw-shrimp.glb` through `raw-shark.glb`

### Resources — Gems (12 models)

- [ ] `uncut-sapphire.glb` through `onyx.glb`

### Resources — Bones (3 models)

- [ ] `bones.glb`
- [ ] `big-bones.glb`
- [ ] `dragon-bones.glb`

### Resources — Hides & Leather (4 models)

- [ ] `cowhide.glb`
- [ ] `leather.glb`
- [ ] `green-dragonhide.glb`
- [ ] `green-dragon-leather.glb`

### Resources — Logs (6 models)

- [ ] `willow-logs.glb`
- [ ] `teak-logs.glb`
- [ ] `maple-logs.glb`
- [ ] `mahogany-logs.glb`
- [ ] `yew-logs.glb`
- [ ] `magic-logs.glb`

### Resources — Fletching (5 models)

- [ ] `headless-arrow.glb`
- [ ] `bowstring.glb`
- [ ] `steel-studs.glb`
- [ ] Arrowtips (6 types — could share one tinted model)

### Resources — Essence (2 models)

- [ ] `rune-essence.glb`
- [ ] `pure-essence.glb`

### Misc (4 models)

- [ ] `coins.glb`
- [ ] `ashes.glb`
- [ ] `xp-lamp.glb`
- [ ] `burnt-fish.glb`

### Tools (10 models)

- [ ] `hammer.glb`
- [ ] `tinderbox.glb`
- [ ] `small-fishing-net.glb`
- [ ] `harpoon.glb`
- [ ] `lobster-pot.glb`
- [ ] `needle.glb`
- [ ] `thread.glb`
- [ ] `chisel.glb`
- [ ] `knife.glb`
- [ ] `fishing-bait.glb`

---

## P4 — Polish & Variety

### Runecrafting Altars (6 unique models needed)

All 6 altars currently share `prayer-alter/prayer-alter.glb`. Each needs a distinct look:

- [ ] Air altar model
- [ ] Mind altar model
- [ ] Water altar model
- [ ] Earth altar model
- [ ] Fire altar model
- [ ] Chaos altar model

### Unique Tree Models (7 models needed)

All 8 tree types share `basic-reg-tree/basic-tree.glb`. Need distinct models:

- [ ] Oak tree
- [ ] Willow tree
- [ ] Teak tree
- [ ] Maple tree
- [ ] Mahogany tree
- [ ] Yew tree
- [ ] Magic tree

### Adamant Rock (1 model + 1 depleted)

- [ ] `adamant-rock/adamant-rock.glb` — defined as `null` in mining manifest
- [ ] `adamant-rock/adamant-rock-depleted.glb`

### Missing Audio SFX

**Skill Sounds:**
- [ ] Mining hit / ore mined
- [ ] Woodcutting chop / tree felled
- [ ] Fishing cast / catch
- [ ] Cooking sizzle / burn
- [ ] Smithing hammer / item forged
- [ ] Smelting furnace
- [ ] Runecrafting craft

**Combat Sounds:**
- [ ] Arrow fire / hit
- [ ] Magic cast / hit
- [ ] Hit splat (damage)
- [ ] Block / 0-damage
- [ ] Death sound
- [ ] Eat food (healing)

**UI Sounds:**
- [ ] Button click
- [ ] Inventory open/close
- [ ] Item pickup
- [ ] Item drop
- [ ] Level up fanfare
- [ ] Quest complete
- [ ] Trade request / complete
- [ ] Bank open/close

**Ambient:**
- [ ] Wind
- [ ] Birds
- [ ] Water / river
- [ ] Fire crackling

### Unused Character Models (already exist, just need NPC entries)

These rigged + animated models exist on disk but aren't used by any NPC:

- `human/human_rigged.glb` (walking, running animations)
- `imp/imp_rigged.glb` (walking, running animations)
- `thug/thug_rigged.glb` (walking, running animations)
- `troll/troll_rigged.glb` (walking, running animations)

---

## What Already Exists (for reference)

<details>
<summary>Click to expand — 80 model files across 54 directories</summary>

```
anvil/anvil.glb
arrows-base/arrows-base.glb
arrows-bronze/arrows-bronze.glb
bait-fishing-rod/bait-fishing-rod.glb + aligned
basic-reg-tree/basic-tree.glb
basic-reg-tree-stump/basic-tree-stump.glb
bow-base/bow-base.glb
bow-oak/bow-oak.glb
bow-willow/bow-willow.glb
bow-wood/bow-wood.glb
chainbody/chainbody.glb
chainbody-dragon/chainbody-dragon.glb
cooking-range/cooking-range.glb
copper-rock/copper-rock.glb + depleted
fishing-rod-base/fishing-rod-base.glb + aligned
fishing-rod-standard/fishing-rod-standard.glb
furnace/furnace.glb
goblin/goblin.vrm + goblin_rigged.glb + animations
grass/grass_1_dream.glb + variants
hatchet-base/hatchet-base.glb
hatchet-bronze/hatchet-bronze.glb + aligned
human/human_rigged.glb + animations
imp/imp_rigged.glb + animations
logs-base/logs-base.glb
logs-wood/logs-wood.glb
mace/mace.glb
mace-dragon/mace-dragon.glb
mithril-rock/mithril-rock.glb
ore-copper/copper.glb
ore-tin/tin.glb
pickaxe/pickaxe.glb
pickaxe-bronze/pickaxe-bronze.glb + aligned
pickaxe-mithril/pickaxe-mithril.glb + aligned
pickaxe-steel/pickaxe-steel.glb + aligned
prayer-alter/prayer-alter.glb
bank-chest/bank-chest.glb
resources/tree-normal.glb + tree-stump.glb
rocks/big_rock_v2.glb + med_rock_v2.glb
runite-rock/runite-rock.glb + depleted
shield-base/shield-base.glb
shield-bronze/shield-bronze.glb
shield-mithril/shield-mithril.glb
shield-steel/shield-steel.glb
spiked-helmet/spiked-helmet.glb
sword-base/sword-base.glb
sword-bronze/sword-bronze.glb + aligned
sword-mithril/sword-mithril.glb + aligned
sword-steel/sword-steel.glb + aligned
thug/thug_rigged.glb + animations
tree/tree.glb
troll/troll_rigged.glb + animations
vegetation/jungle_tree_1-3.glb
avatars/avatar-male-01.vrm
avatars/avatar-male-02.vrm
avatars/avatar-female-01.vrm
avatars/avatar-female-02.vrm
```

</details>

<details>
<summary>Click to expand — Audio files</summary>

```
audio/music/normal/1-14.mp3 (7 tracks)
audio/music/combat/1-4.mp3
audio/music/intro/1-2.mp3
audio/music/drafts/ (~15 experimental tracks)
audio/sfx/sword-clash-001 through 006
audio/sfx/boards-crashing, boat-rocking, door-creaks
audio/sfx/coin-purse-drop
audio/voice/ (~28 NPC voice lines)
```

</details>

<details>
<summary>Click to expand — Textures (complete)</summary>

```
terrain: grass, rock, snow, dirt (diffuse + normal + ktx2)
water: 10 particle textures, normals, wave maps, cubemap
sky: 4 cloud textures, galaxy, moon, star, lens flares, HDR
LUTs: 5 CUBE, 1 3DL, 3 PNG color lookup tables
```

</details>
