# Plan: Fix Coins Not Persisting After Store Transactions (#702)

## Problem

Store buy/sell transactions update coins directly in the database but never sync the CoinPouchSystem's in-memory cache. The stale in-memory balance then overwrites the correct DB value on the next auto-save (every 30 seconds), reverting the purchase.

## Root Cause

`emitInventorySyncEvents()` was removed from `handleStoreBuy` and `handleStoreSell` with the incorrect assumption that `reloadFromDatabase()` handles coin sync. It does not — `reloadFromDatabase()` only reloads inventory items and explicitly sets `coins: 0` with the comment "Coins managed by CoinPouchSystem, not stored here".

The bank coin handlers (`bank/coins.ts`) still correctly call `emitInventorySyncEvents()` and do not have this bug.

## Fix

### Phase 1: Re-add coin sync to store handlers

**File**: `packages/server/src/systems/ServerNetwork/handlers/store.ts`

**Change 1 — `handleStoreBuy` (after line 361):**

Replace the comment:
```
// NOTE: emitInventorySyncEvents removed - reloadFromDatabase() handles in-memory sync
```

With a call to sync the coin balance to CoinPouchSystem:
```typescript
// Sync CoinPouchSystem in-memory cache with the new DB balance.
// reloadFromDatabase() only reloads inventory items, NOT coins.
// Without this, the stale in-memory balance overwrites the DB on next auto-save.
emitInventorySyncEvents(ctx, {
  newCoinBalance: result.newCoinBalance,
});
```

`emitInventorySyncEvents` is already imported in `store.ts` via the `./common` barrel export. It just needs to be called again.

**Change 2 — `handleStoreSell` (after line 583):**

Same change — replace the comment with the `emitInventorySyncEvents` call:
```typescript
emitInventorySyncEvents(ctx, {
  newCoinBalance: result.newCoinBalance,
});
```

### Phase 2: Verify the import exists

**File**: `packages/server/src/systems/ServerNetwork/handlers/store.ts`

Confirm that `emitInventorySyncEvents` is already imported from `./common`. If not, add it to the existing import block (line 48-53).

### Phase 3: Check bank/core.ts for the same issue

**File**: `packages/server/src/systems/ServerNetwork/handlers/bank/core.ts`

Three locations have the same `// NOTE: emitInventorySyncEvents removed` comment (lines 375, 735, 950). These are bank deposit/withdraw item operations (not coin operations). Verify whether any of these modify the `characters.coins` column:

- If they do → they need the same fix
- If they only modify `bank_storage` and `inventory` rows → no fix needed (coins unchanged)

Bank item deposit/withdraw should NOT modify coins, so these are likely fine. But verify during implementation.

### Phase 4: Build and test

1. `bun run build:shared && bun run build:server` — verify no compile errors
2. Smoke test:
   - Open store, buy an item, note coin balance
   - Wait 30+ seconds (past auto-save interval)
   - Restart server
   - Log back in — coins should reflect the purchase

## Files to Modify

1. `packages/server/src/systems/ServerNetwork/handlers/store.ts` — Re-add `emitInventorySyncEvents` in `handleStoreBuy` and `handleStoreSell`

## Files to Verify (no changes expected)

2. `packages/server/src/systems/ServerNetwork/handlers/bank/core.ts` — Confirm the three removed `emitInventorySyncEvents` calls don't involve coin changes
3. `packages/server/src/systems/ServerNetwork/handlers/common/transaction.ts` — Confirm `emitInventorySyncEvents` still emits `INVENTORY_UPDATE_COINS` correctly (lines 273-280)

## Why This Works

`emitInventorySyncEvents` with `newCoinBalance` emits `INVENTORY_UPDATE_COINS`. CoinPouchSystem subscribes to this event (`CoinPouchSystem.ts:106-110`) and calls `setCoins()`, which:
1. Updates the in-memory `coinBalances` Map to the correct post-transaction value
2. Emits `INVENTORY_COINS_UPDATED` to notify the client
3. Schedules a debounced DB persist (which now writes the correct value, not the stale one)

This is identical to how the bank coin deposit/withdraw handlers work and have been working correctly.
