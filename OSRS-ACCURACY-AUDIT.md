# OSRS Accuracy Audit

> Audit Date: 2025-12-26
> Purpose: Compare Hyperscape combat timing constants to actual OSRS values

---

## Exact Matches

| Constant | Our Value | OSRS Value | Source |
|----------|-----------|------------|--------|
| Tick Duration | 600ms | 600ms | [OSRS Wiki - Game tick](https://oldschool.runescape.wiki/w/Game_tick) |
| Default Attack Speed | 4 ticks (2.4s) | 4 ticks | [OSRS Wiki - Attack speed](https://oldschool.runescape.wiki/w/Attack_speed) |
| Combat Timeout | 8 ticks (4.8s) | 8 ticks | [OSRS Wiki - Flinching](https://oldschool.runescape.wiki/w/Flinching) |
| Health Regen Interval | 100 ticks (60s) | 100 ticks | [OSRS Wiki - Hitpoints](https://oldschool.runescape.wiki/w/Hitpoints) |
| AFK Auto-Retaliate Disable | 2000 ticks (20 min) | 20 minutes | [OSRS Wiki - Idle](https://oldschool.runescape.wiki/w/Idle) |

---

## Does NOT Match OSRS

| Constant | Our Value | OSRS Value | Difference |
|----------|-----------|------------|------------|
| **Gravestone Duration** | 500 ticks (5 min) | **1500 ticks (15 min)** | We're 3x shorter |
| **Ground Item Despawn** | 200 ticks (2 min) | ~300 ticks (3 min total) | We're shorter |

### Gravestone Duration Details

OSRS gives players **15 minutes** after respawning to return to their grave and collect items. After 15 minutes, items are sent to Death's Office where a reclamation fee applies.

Our current value of 5 minutes is significantly shorter and may frustrate players who die far from their respawn point.

**Recommendation**: Update `GRAVESTONE_TICKS` from 500 to 1500.

### Ground Item Despawn Details

In OSRS:
- Tradeable items appear to other players after 60 seconds
- Items despawn after another 120 seconds (3 minutes total from drop)
- Untradeable items despawn after 180 seconds (3 minutes)

Our current value of 2 minutes is shorter than OSRS.

**Recommendation**: Update `GROUND_ITEM_DESPAWN_TICKS` from 200 to 300.

---

## Custom Mechanics (Not in OSRS)

| Constant | Our Value | OSRS Behavior |
|----------|-----------|---------------|
| **Health Regen Cooldown** | 17 ticks (10.2s) after damage | **No cooldown** - OSRS regen runs on constant timer |
| **Death Animation** | 8 ticks (4.8s) | Unclear - couldn't find exact tick count in wiki |

### Health Regen Cooldown

OSRS does **not** have a cooldown after taking damage. Health regeneration runs on a constant 100-tick timer regardless of combat activity. The only way to reset the timer is by toggling Rapid Heal prayer.

Our implementation adds a 17-tick cooldown after taking damage before regen resumes. This is a **custom mechanic** that makes the game slightly harder than OSRS.

**Decision needed**: Keep as custom mechanic for balance, or remove to match OSRS?

---

## Constants Location

All timing constants are in:
```
packages/shared/src/constants/CombatConstants.ts
```

Key sections:
- `TICK_DURATION_MS`: 600
- `DEFAULT_ATTACK_SPEED_TICKS`: 4
- `COMBAT_TIMEOUT_TICKS`: 8
- `HEALTH_REGEN_INTERVAL_TICKS`: 100
- `HEALTH_REGEN_COOLDOWN_TICKS`: 17
- `AFK_DISABLE_RETALIATE_TICKS`: 2000
- `GRAVESTONE_TICKS`: 500
- `GROUND_ITEM_DESPAWN_TICKS`: 200

---

## Sources

- [OSRS Wiki - Game tick](https://oldschool.runescape.wiki/w/Game_tick)
- [OSRS Wiki - Attack speed](https://oldschool.runescape.wiki/w/Attack_speed)
- [OSRS Wiki - Flinching](https://oldschool.runescape.wiki/w/Flinching)
- [OSRS Wiki - Hitpoints](https://oldschool.runescape.wiki/w/Hitpoints)
- [OSRS Wiki - Idle](https://oldschool.runescape.wiki/w/Idle)
- [OSRS Wiki - Grave](https://oldschool.runescape.wiki/w/Grave)
- [OSRS Wiki - Drop](https://oldschool.runescape.wiki/w/Drop)
- [OSRS Wiki - Rapid Heal](https://oldschool.runescape.wiki/w/Rapid_Heal)

---

## Action Items

- [ ] Update `GRAVESTONE_TICKS` from 500 to 1500 (5 min → 15 min)
- [ ] Update `GROUND_ITEM_DESPAWN_TICKS` from 200 to 300 (2 min → 3 min)
- [ ] Decide on `HEALTH_REGEN_COOLDOWN_TICKS` - keep custom or remove to match OSRS
- [ ] Verify death animation duration against OSRS (8 ticks seems reasonable)
