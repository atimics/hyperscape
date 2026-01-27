# Duel Arena System - Technical Audit & Implementation Plan

**Audit Date:** 2026-01-27
**Current Score:** 8.2/10
**Target Score:** 9.0/10+
**Auditor:** Claude Code

---

## Executive Summary

The duel arena system is a well-architected OSRS-accurate player-to-player dueling implementation spanning ~4,500 lines across server, client, and shared packages. The system demonstrates strong architectural patterns with clear separation of concerns, proper state machine design, and comprehensive security measures.

**Key Strengths:**
- Server-authoritative design (9.5/10)
- Game programming patterns (9/10)
- OWASP security compliance (9/10)
- Clean handler organization

**Critical Gaps:**
- No database transactions for stake operations (economic integrity risk)
- No audit logging for financial transactions
- No unit tests
- DuelSystem violates Single Responsibility Principle

---

## Current Scores by Category

| Category | Score | Target | Gap |
|----------|-------|--------|-----|
| Production Quality | 8.0 | 9.0 | -1.0 |
| Best Practices | 8.0 | 9.0 | -1.0 |
| OWASP Security | 9.0 | 9.5 | -0.5 |
| CWE Top 25 | 9.0 | 9.5 | -0.5 |
| SOLID Principles | 7.5 | 9.0 | -1.5 |
| GRASP Principles | 8.0 | 9.0 | -1.0 |
| Clean Code | 8.0 | 9.0 | -1.0 |
| Law of Demeter | 7.5 | 8.5 | -1.0 |
| Memory Hygiene | 8.5 | 9.0 | -0.5 |
| TypeScript Rigor | 8.0 | 9.0 | -1.0 |
| UI Integration | 8.5 | 9.0 | -0.5 |
| Game Patterns | 9.0 | 9.0 | 0 |
| Server Authority | 9.5 | 9.5 | 0 |
| Client Responsiveness | 8.0 | 8.5 | -0.5 |
| Tick System | 9.0 | 9.0 | 0 |
| Anti-Cheat | 9.0 | 9.5 | -0.5 |
| Economic Integrity | 8.0 | 9.5 | -1.5 |
| Persistence/Database | 7.5 | 9.0 | -1.5 |
| PostgreSQL Discipline | 7.5 | 9.0 | -1.5 |
| Distributed Systems | 8.0 | 9.0 | -1.0 |
| Code Organization | 8.5 | 9.0 | -0.5 |
| Manifest-Driven | 8.0 | 9.0 | -1.0 |
| **Overall** | **8.2** | **9.0** | **-0.8** |

---

## Detailed Findings

### Critical Issues

#### 1. No Database Transactions for Stake Operations
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`
**Lines:** 126-151, 252-307

**Problem:** Stake add/remove operations modify both the DuelSystem state AND the database inventory without transaction wrapping. If the database operation fails after the DuelSystem state is modified, items can be duplicated or lost.

```typescript
// Current code - NOT ATOMIC
const result = duelSystem.addStake(...); // Modifies session
// ... gap where failure could occur ...
await db.pool.query(`DELETE FROM inventory...`); // Modifies DB
```

**Risk:** Item duplication exploit, economic integrity violation

---

#### 2. No Audit Logging for Economic Transactions
**File:** `packages/server/src/systems/DuelSystem/index.ts`
**Lines:** 1714-1780 (transferStakes)

**Problem:** Stake transfers between players are not logged. For a game with real economic value, this is unacceptable for:
- Fraud investigation
- Dispute resolution
- Compliance requirements
- Analytics

**Risk:** Cannot trace economic exploits, no paper trail for support tickets

---

#### 3. No Unit Tests
**Location:** No test files found in `packages/server/src/systems/DuelSystem/`

**Problem:** Zero test coverage for:
- State machine transitions
- Stake validation logic
- Rule combination validation
- Edge cases (simultaneous death, disconnect during stake)

**Risk:** Regressions, undetected bugs, difficult refactoring

---

### High Priority Issues

#### 4. DuelSystem Violates Single Responsibility Principle
**File:** `packages/server/src/systems/DuelSystem/index.ts`
**Lines:** 1,873 total

**Problem:** Single class handles:
- Session CRUD
- State transitions
- Countdown processing
- Combat resolution
- Stake transfers
- Health restoration
- Teleportation
- Arena bounds enforcement
- Disconnect handling

**Impact:** Difficult to test, maintain, and extend

---

#### 5. No Rate Limiting on Stake Operations
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`

**Problem:** While challenges are rate-limited, stake add/remove operations have no rate limiting. Malicious client could spam stake operations.

---

#### 6. No SELECT FOR UPDATE on Inventory Reads
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`
**Lines:** 76-83

**Problem:** Inventory is read without row locking, creating a TOCTOU (Time-of-Check-Time-of-Use) vulnerability:
```typescript
const inventoryItems = await inventoryRepo.getPlayerInventoryAsync(playerId);
const inventoryItem = inventoryItems.find(...); // Check
// ... other player could modify inventory here ...
await db.pool.query(`DELETE FROM inventory...`); // Use
```

---

#### 7. No IDuelSystem Interface
**File:** `packages/shared/src/types/systems/system-interfaces.ts`

**Problem:** No interface defined for DuelSystem, making it difficult to:
- Mock for testing
- Swap implementations
- Enforce contracts

---

### Medium Priority Issues

#### 8. Magic Numbers Throughout Codebase
**Locations:**
- `PendingDuelManager.ts:21` - `MAX_CHALLENGE_DISTANCE_TILES = 15`
- `PendingDuelManager.ts:18` - `CHALLENGE_TIMEOUT_MS = 30_000`
- `DuelSystem.ts:149` - `DISCONNECT_TIMEOUT_MS = 30_000`
- `DuelSystem.ts:1803-1805` - Hardcoded lobby spawn coordinates
- `DuelSystem.ts:1787` - Hardcoded hospital spawn coordinates

---

#### 9. Debug Console.logs in Production Code
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/challenge.ts`
**Lines:** 43-61 (15+ debug logs)

```typescript
console.log("[DuelChallenge] Received challenge request:", data);
console.log("[DuelChallenge] Challenger:", playerId, "Target:", data.targetPlayerId);
// ... 13 more debug logs
```

---

#### 10. No Exhaustive Switch for DuelState
**File:** `packages/server/src/systems/DuelSystem/index.ts`

**Problem:** State transitions don't use exhaustive switch with `never` check:
```typescript
// Current - no exhaustiveness check
if (session.state === "COUNTDOWN") { ... }
else if (session.state === "FIGHTING") { ... }
```

---

#### 11. Unsafe Type Casts
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/helpers.ts`
**Lines:** 51-58, 67-78

```typescript
const entity = player as unknown as {
  name?: string;
  data?: { name?: string };
  characterName?: string;
};
```

---

#### 12. Law of Demeter Violations
**File:** `packages/server/src/systems/ServerNetwork/handlers/duel/helpers.ts`
**Lines:** 96-119

```typescript
const serverNetwork = world.getSystem("network") as | {
    broadcastManager?: {
      getPlayerSocket: (id: string) => ServerSocket | undefined;
    };
    // ... deep chain access
```

---

#### 13. Style Objects Recreated Each Render
**File:** `packages/client/src/game/panels/DuelPanel/RulesScreen.tsx`
**Lines:** 117-215

```typescript
// Created fresh every render
const containerStyle: CSSProperties = { ... };
const sectionStyle: CSSProperties = { ... };
```

---

#### 14. Non-Deterministic Map Iteration
**File:** `packages/server/src/systems/DuelSystem/index.ts`
**Lines:** 231-237

```typescript
for (const [_duelId, session] of this.duelSessions) {
  // Map iteration order is insertion order, but not guaranteed deterministic
```

---

#### 15. Command-Query Separation Violations
**File:** `packages/server/src/systems/DuelSystem/index.ts`

**Problem:** Methods both modify state AND return data:
```typescript
acceptFinal(duelId, playerId): DuelOperationResult & { arenaId?: number }
// Modifies state AND returns arena info
```

---

---

## Implementation Plan

### Phase 1: Critical Fixes (Economic Integrity & Security)
**Estimated Impact:** +0.5 to overall score
**Priority:** CRITICAL - Do First

#### Task 1.1: Add Database Transaction Wrapping for Stakes
**Files to modify:**
- `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`

**Changes:**
```typescript
// New helper function
async function withTransaction<T>(
  db: DatabaseConnection,
  fn: () => Promise<T>
): Promise<T> {
  await db.pool.query('BEGIN');
  try {
    const result = await fn();
    await db.pool.query('COMMIT');
    return result;
  } catch (error) {
    await db.pool.query('ROLLBACK');
    throw error;
  }
}

// Updated handleDuelAddStake
export async function handleDuelAddStake(...) {
  // ... validation ...

  await withTransaction(db, async () => {
    // Lock the inventory row
    const lockResult = await db.pool.query(
      `SELECT * FROM inventory WHERE "playerId" = $1 AND "slotIndex" = $2 FOR UPDATE`,
      [playerId, inventorySlot]
    );

    if (lockResult.rows.length === 0) {
      throw new Error('Item not found');
    }

    // Add to stakes (in-memory)
    const result = duelSystem.addStake(...);
    if (!result.success) {
      throw new Error(result.error);
    }

    // Remove from inventory (DB)
    await db.pool.query(
      `DELETE FROM inventory WHERE "playerId" = $1 AND "slotIndex" = $2`,
      [playerId, inventorySlot]
    );
  });
}
```

---

#### Task 1.2: Add Audit Logging for Economic Transactions
**Files to create:**
- `packages/server/src/services/AuditLogger.ts`

**Files to modify:**
- `packages/server/src/systems/DuelSystem/index.ts`

**New AuditLogger service:**
```typescript
// packages/server/src/services/AuditLogger.ts
export interface AuditLogEntry {
  timestamp: string;
  action: string;
  entityType: 'DUEL' | 'TRADE' | 'BANK' | 'SHOP';
  entityId: string;
  playerId: string;
  data: Record<string, unknown>;
}

export class AuditLogger {
  private static instance: AuditLogger;

  static getInstance(): AuditLogger {
    if (!this.instance) {
      this.instance = new AuditLogger();
    }
    return this.instance;
  }

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Structured log for log aggregation (CloudWatch, Datadog, etc.)
    console.log('[AUDIT]', JSON.stringify(fullEntry));

    // TODO: Also write to audit_log table for persistence
  }

  logDuelStakeAdd(duelId: string, playerId: string, item: StakedItem): void {
    this.log({
      action: 'DUEL_STAKE_ADD',
      entityType: 'DUEL',
      entityId: duelId,
      playerId,
      data: { itemId: item.itemId, quantity: item.quantity, value: item.value },
    });
  }

  logDuelStakeRemove(duelId: string, playerId: string, item: StakedItem): void {
    this.log({
      action: 'DUEL_STAKE_REMOVE',
      entityType: 'DUEL',
      entityId: duelId,
      playerId,
      data: { itemId: item.itemId, quantity: item.quantity, value: item.value },
    });
  }

  logDuelComplete(
    duelId: string,
    winnerId: string,
    loserId: string,
    winnerReceives: StakedItem[],
    totalValue: number
  ): void {
    this.log({
      action: 'DUEL_COMPLETE',
      entityType: 'DUEL',
      entityId: duelId,
      playerId: winnerId,
      data: {
        loserId,
        itemsTransferred: winnerReceives.map(s => ({
          itemId: s.itemId,
          quantity: s.quantity,
          value: s.value,
        })),
        totalValue,
      },
    });
  }
}
```

**Add to DuelSystem.transferStakes():**
```typescript
private transferStakes(session: DuelSession, winnerId: string): void {
  // ... existing code ...

  // Add audit logging
  const auditLogger = AuditLogger.getInstance();
  auditLogger.logDuelComplete(
    session.duelId,
    winnerId,
    loserId,
    loserStakes,
    winnerReceivesValue
  );

  // ... rest of existing code ...
}
```

---

#### Task 1.3: Add Rate Limiting to Stake Operations
**Files to modify:**
- `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`

**Changes:**
```typescript
import { rateLimiter } from "./helpers";

export async function handleDuelAddStake(...) {
  // ... auth check ...

  // Add rate limiting
  if (!rateLimiter.tryOperation(playerId, 'duel_stake')) {
    sendDuelError(socket, "Please wait before modifying stakes", "RATE_LIMITED");
    return;
  }

  // ... rest of function ...
}

export async function handleDuelRemoveStake(...) {
  // ... auth check ...

  // Add rate limiting
  if (!rateLimiter.tryOperation(playerId, 'duel_stake')) {
    sendDuelError(socket, "Please wait before modifying stakes", "RATE_LIMITED");
    return;
  }

  // ... rest of function ...
}
```

---

### Phase 2: Testing Infrastructure
**Estimated Impact:** +0.3 to overall score
**Priority:** HIGH

#### Task 2.1: Create Test Infrastructure
**Files to create:**
- `packages/server/src/systems/DuelSystem/__tests__/DuelSystem.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/PendingDuelManager.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/ArenaPoolManager.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/mocks.ts`

**Test file structure:**
```typescript
// packages/server/src/systems/DuelSystem/__tests__/DuelSystem.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DuelSystem } from '../index';
import { createMockWorld } from './mocks';

describe('DuelSystem', () => {
  let duelSystem: DuelSystem;
  let mockWorld: ReturnType<typeof createMockWorld>;

  beforeEach(() => {
    mockWorld = createMockWorld();
    duelSystem = new DuelSystem(mockWorld);
    duelSystem.init();
  });

  describe('Challenge Flow', () => {
    it('should create a challenge between two players', () => {
      const result = duelSystem.createChallenge(
        'player1', 'Player One',
        'player2', 'Player Two'
      );

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    it('should reject self-challenge', () => {
      const result = duelSystem.createChallenge(
        'player1', 'Player One',
        'player1', 'Player One'
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TARGET');
    });

    it('should reject challenge if player already in duel', () => {
      // Create first duel
      duelSystem.createChallenge('player1', 'P1', 'player2', 'P2');
      duelSystem.respondToChallenge('challenge1', 'player2', true);

      // Try to create second duel
      const result = duelSystem.createChallenge('player1', 'P1', 'player3', 'P3');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ALREADY_IN_DUEL');
    });
  });

  describe('State Transitions', () => {
    it('should transition RULES -> STAKES when both accept', () => {
      // Setup duel in RULES state
      const duelId = setupDuelInRulesState(duelSystem);

      duelSystem.acceptRules(duelId, 'player1');
      expect(duelSystem.getDuelSession(duelId)?.state).toBe('RULES');

      duelSystem.acceptRules(duelId, 'player2');
      expect(duelSystem.getDuelSession(duelId)?.state).toBe('STAKES');
    });

    it('should reset acceptance when rules modified', () => {
      const duelId = setupDuelInRulesState(duelSystem);

      duelSystem.acceptRules(duelId, 'player1');
      duelSystem.toggleRule(duelId, 'player2', 'noMelee');

      const session = duelSystem.getDuelSession(duelId);
      expect(session?.challengerAccepted).toBe(false);
    });
  });

  describe('Stake Validation', () => {
    it('should reject duplicate inventory slot stakes', () => {
      const duelId = setupDuelInStakesState(duelSystem);

      duelSystem.addStake(duelId, 'player1', 0, 'item1', 1, 100);
      const result = duelSystem.addStake(duelId, 'player1', 0, 'item1', 1, 100);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ALREADY_STAKED');
    });
  });

  describe('Rule Validation', () => {
    it('should reject invalid rule combinations', () => {
      const duelId = setupDuelInRulesState(duelSystem);

      duelSystem.toggleRule(duelId, 'player1', 'noForfeit');
      const result = duelSystem.toggleRule(duelId, 'player1', 'noMovement');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_RULE_COMBINATION');
    });
  });

  describe('Death Handling', () => {
    it('should resolve duel when player dies during FIGHTING', () => {
      const duelId = setupDuelInFightingState(duelSystem);

      // Simulate player1 death
      mockWorld.emit('ENTITY_DEATH', { entityId: 'player1', entityType: 'player' });

      // Wait for death resolution (5 second delay)
      vi.advanceTimersByTime(5000);

      const session = duelSystem.getDuelSession(duelId);
      expect(session).toBeUndefined(); // Cleaned up after resolution
    });

    it('should ignore death if not in FIGHTING state', () => {
      const duelId = setupDuelInRulesState(duelSystem);

      mockWorld.emit('ENTITY_DEATH', { entityId: 'player1', entityType: 'player' });

      const session = duelSystem.getDuelSession(duelId);
      expect(session?.state).toBe('RULES'); // Unchanged
    });
  });
});
```

---

### Phase 3: SOLID Refactoring
**Estimated Impact:** +0.4 to overall score
**Priority:** HIGH

#### Task 3.1: Define IDuelSystem Interface
**Files to modify:**
- `packages/shared/src/types/systems/system-interfaces.ts`

**Add interface:**
```typescript
// packages/shared/src/types/systems/system-interfaces.ts

export interface IDuelSystem extends System {
  // Lifecycle
  init(): void;
  destroy(): void;
  processTick(): void;

  // Challenge Flow
  createChallenge(
    challengerId: string,
    challengerName: string,
    targetId: string,
    targetName: string,
  ): { success: boolean; error?: string; errorCode?: string; challengeId?: string };

  respondToChallenge(
    challengeId: string,
    responderId: string,
    accept: boolean,
  ): { success: boolean; error?: string; errorCode?: string; duelId?: string };

  // Session Management
  getDuelSession(duelId: string): DuelSession | undefined;
  getPlayerDuel(playerId: string): DuelSession | undefined;
  getPlayerDuelId(playerId: string): string | undefined;
  isPlayerInDuel(playerId: string): boolean;
  cancelDuel(duelId: string, reason: string, cancelledBy?: string): DuelOperationResult;

  // Rules
  toggleRule(duelId: string, playerId: string, rule: keyof DuelRules): DuelOperationResult;
  toggleEquipmentRestriction(duelId: string, playerId: string, slot: EquipmentSlot): DuelOperationResult;
  acceptRules(duelId: string, playerId: string): DuelOperationResult;

  // Stakes
  addStake(
    duelId: string,
    playerId: string,
    inventorySlot: number,
    itemId: string,
    quantity: number,
    value: number,
  ): DuelOperationResult;
  removeStake(duelId: string, playerId: string, stakeIndex: number): DuelOperationResult;
  acceptStakes(duelId: string, playerId: string): DuelOperationResult;

  // Confirmation & Combat
  acceptFinal(duelId: string, playerId: string): DuelOperationResult & { arenaId?: number };
  forfeitDuel(playerId: string): DuelOperationResult;

  // Rule Queries
  isPlayerInActiveDuel(playerId: string): boolean;
  getPlayerDuelRules(playerId: string): DuelRules | null;
  canMove(playerId: string): boolean;
  canForfeit(playerId: string): boolean;
  getDuelOpponentId(playerId: string): string | null;

  // Arena
  getArenaSpawnPoints(arenaId: number): [ArenaSpawnPoint, ArenaSpawnPoint] | undefined;
  getArenaBounds(arenaId: number): ArenaBounds | undefined;
}
```

---

#### Task 3.2: Split DuelSystem into Focused Managers
**Files to create:**
- `packages/server/src/systems/DuelSystem/DuelSessionManager.ts`
- `packages/server/src/systems/DuelSystem/DuelStateTransitionManager.ts`
- `packages/server/src/systems/DuelSystem/DuelCombatResolver.ts`
- `packages/server/src/systems/DuelSystem/DuelArenaEnforcer.ts`

**New file structure:**
```
packages/server/src/systems/DuelSystem/
├── index.ts                      # Main DuelSystem (facade, ~300 lines)
├── DuelSessionManager.ts         # Session CRUD (~200 lines)
├── DuelStateTransitionManager.ts # State machine logic (~250 lines)
├── DuelCombatResolver.ts         # Death handling, stake transfer (~300 lines)
├── DuelArenaEnforcer.ts          # Bounds, movement, teleportation (~200 lines)
├── PendingDuelManager.ts         # Existing (unchanged)
├── ArenaPoolManager.ts           # Existing (unchanged)
└── __tests__/
    ├── DuelSystem.test.ts
    ├── DuelSessionManager.test.ts
    └── mocks.ts
```

**DuelSessionManager.ts:**
```typescript
// packages/server/src/systems/DuelSystem/DuelSessionManager.ts
import type { World } from "@hyperscape/shared";
import type { DuelSession, DuelRules, StakedItem } from "@hyperscape/shared";
import { DEFAULT_DUEL_RULES } from "@hyperscape/shared";

export class DuelSessionManager {
  private duelSessions = new Map<string, DuelSession>();
  private playerDuels = new Map<string, string>();

  constructor(private world: World) {}

  createSession(
    challengerId: string,
    challengerName: string,
    targetId: string,
    targetName: string,
  ): string {
    const duelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const session: DuelSession = {
      duelId,
      state: "RULES",
      challengerId,
      challengerName,
      targetId,
      targetName,
      rules: { ...DEFAULT_DUEL_RULES },
      equipmentRestrictions: this.createDefaultEquipmentRestrictions(),
      challengerStakes: [],
      targetStakes: [],
      challengerAccepted: false,
      targetAccepted: false,
      arenaId: null,
      createdAt: Date.now(),
    };

    this.duelSessions.set(duelId, session);
    this.playerDuels.set(challengerId, duelId);
    this.playerDuels.set(targetId, duelId);

    return duelId;
  }

  getSession(duelId: string): DuelSession | undefined {
    return this.duelSessions.get(duelId);
  }

  getPlayerSession(playerId: string): DuelSession | undefined {
    const duelId = this.playerDuels.get(playerId);
    return duelId ? this.duelSessions.get(duelId) : undefined;
  }

  getPlayerDuelId(playerId: string): string | undefined {
    return this.playerDuels.get(playerId);
  }

  isPlayerInDuel(playerId: string): boolean {
    return this.playerDuels.has(playerId);
  }

  deleteSession(duelId: string): DuelSession | undefined {
    const session = this.duelSessions.get(duelId);
    if (session) {
      this.duelSessions.delete(duelId);
      this.playerDuels.delete(session.challengerId);
      this.playerDuels.delete(session.targetId);
    }
    return session;
  }

  getAllSessions(): IterableIterator<[string, DuelSession]> {
    return this.duelSessions.entries();
  }

  private createDefaultEquipmentRestrictions() {
    return {
      head: false, cape: false, amulet: false, weapon: false,
      body: false, shield: false, legs: false, gloves: false,
      boots: false, ring: false, ammo: false,
    };
  }
}
```

---

### Phase 4: Code Quality Improvements
**Estimated Impact:** +0.3 to overall score
**Priority:** MEDIUM

#### Task 4.1: Create Configuration Constants File
**Files to create:**
- `packages/server/src/systems/DuelSystem/config.ts`

```typescript
// packages/server/src/systems/DuelSystem/config.ts

export const DUEL_CONFIG = {
  // Timing
  CHALLENGE_TIMEOUT_MS: 30_000,
  DISCONNECT_TIMEOUT_MS: 30_000,
  SESSION_MAX_AGE_MS: 30 * 60 * 1000, // 30 minutes
  DEATH_RESOLUTION_DELAY_MS: 5_000,

  // Distance
  CHALLENGE_DISTANCE_TILES: 15,

  // Arena
  ARENA_COUNT: 6,
  ARENA_BASE_X: 60,
  ARENA_BASE_Z: 80,
  ARENA_Y: 0,
  ARENA_WIDTH: 20,
  ARENA_LENGTH: 24,
  ARENA_GAP: 4,
  SPAWN_OFFSET: 8,

  // Spawns
  LOBBY_SPAWN_WINNER: { x: 102, y: 0, z: 60 },
  LOBBY_SPAWN_LOSER: { x: 108, y: 0, z: 60 },
  HOSPITAL_SPAWN: { x: 60, y: 0, z: 60 },

  // Limits
  MAX_STAKES_PER_PLAYER: 28,
} as const;
```

---

#### Task 4.2: Replace Console.log with Structured Logger
**Files to create:**
- `packages/server/src/services/Logger.ts`

**Files to modify:**
- `packages/server/src/systems/ServerNetwork/handlers/duel/challenge.ts`
- `packages/server/src/systems/DuelSystem/index.ts`

```typescript
// packages/server/src/services/Logger.ts

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level: LogLevel =
    process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;

  static setLevel(level: LogLevel): void {
    this.level = level;
  }

  static debug(system: string, message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[${system}] ${message}`, data ? JSON.stringify(data) : '');
    }
  }

  static info(system: string, message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`[${system}] ${message}`, data ? JSON.stringify(data) : '');
    }
  }

  static warn(system: string, message: string, data?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[${system}] ${message}`, data ? JSON.stringify(data) : '');
    }
  }

  static error(system: string, message: string, error?: Error, data?: Record<string, unknown>): void {
    console.error(`[${system}] ${message}`, error?.message, data ? JSON.stringify(data) : '');
  }
}

// Usage in challenge.ts:
Logger.debug('DuelChallenge', 'Received challenge request', { targetPlayerId: data.targetPlayerId });
```

---

#### Task 4.3: Add Exhaustive Switch for DuelState
**Files to modify:**
- `packages/server/src/systems/DuelSystem/index.ts`

```typescript
// Add utility function
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

// Update processTick
processTick(): void {
  this.pendingDuels.processTick();

  for (const [_duelId, session] of this.duelSessions) {
    switch (session.state) {
      case "RULES":
      case "STAKES":
      case "CONFIRMING":
        // No tick processing needed for setup states
        break;
      case "COUNTDOWN":
        this.processCountdown(session);
        break;
      case "FIGHTING":
        this.processActiveDuel(session);
        break;
      case "FINISHED":
        // Resolution in progress, no tick processing
        break;
      default:
        assertNever(session.state);
    }
  }
}
```

---

#### Task 4.4: Create Proper Entity Interfaces
**Files to create:**
- `packages/shared/src/types/entities/player-interface.ts`

```typescript
// packages/shared/src/types/entities/player-interface.ts

export interface IPlayerEntity {
  id: string;
  position: { x: number; y: number; z: number };
  name: string;
  combatLevel: number;
  data: {
    name?: string;
    deathState?: DeathState;
    e?: string; // emote
  };
  markNetworkDirty(): void;
}

// Type guard
export function isPlayerEntity(entity: unknown): entity is IPlayerEntity {
  return (
    typeof entity === 'object' &&
    entity !== null &&
    'id' in entity &&
    'position' in entity
  );
}
```

---

#### Task 4.5: Fix Law of Demeter Violations
**Files to modify:**
- `packages/shared/src/core/World.ts` (or wherever World is defined)
- `packages/server/src/systems/ServerNetwork/handlers/duel/helpers.ts`

**Add methods to World:**
```typescript
// Add to World class
getPlayerSocket(playerId: string): ServerSocket | undefined {
  const network = this.getSystem("network");
  // Encapsulate the lookup logic
  return network?.getPlayerSocket?.(playerId);
}

getPlayerName(playerId: string): string {
  const player = this.entities.players?.get(playerId);
  return player?.name || player?.data?.name || "Unknown";
}

getPlayerCombatLevel(playerId: string): number {
  const player = this.entities.players?.get(playerId);
  return player?.combatLevel || player?.data?.combatLevel || 3;
}
```

**Update helpers.ts:**
```typescript
// Replace deep chain access
export function getSocketByPlayerId(world: World, playerId: string): ServerSocket | undefined {
  return world.getPlayerSocket(playerId);
}

export function getPlayerName(world: World, playerId: string): string {
  return world.getPlayerName(playerId);
}
```

---

### Phase 5: UI Optimizations
**Estimated Impact:** +0.1 to overall score
**Priority:** LOW

#### Task 5.1: Memoize Style Objects
**Files to modify:**
- `packages/client/src/game/panels/DuelPanel/RulesScreen.tsx`
- `packages/client/src/game/panels/DuelPanel/StakesScreen.tsx`
- `packages/client/src/game/panels/DuelPanel/ConfirmScreen.tsx`

```typescript
// Extract styles to module scope or use useMemo
const useStyles = (theme: Theme) => useMemo(() => ({
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: theme.spacing.md,
    height: "100%",
  },
  section: {
    background: theme.colors.background.tertiary,
    border: `1px solid ${theme.colors.border.default}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  // ... other styles
}), [theme]);

// In component:
export function RulesScreen({ ... }) {
  const theme = useThemeStore((s) => s.theme);
  const styles = useStyles(theme);

  return (
    <div style={styles.container}>
      {/* ... */}
    </div>
  );
}
```

---

## Implementation Order & Timeline

| Phase | Tasks | Priority | Est. Effort |
|-------|-------|----------|-------------|
| **1** | Transaction wrapping, Audit logging, Rate limiting | CRITICAL | 1-2 days |
| **2** | Test infrastructure | HIGH | 2-3 days |
| **3** | Interface definition, DuelSystem split | HIGH | 2-3 days |
| **4** | Config constants, Logger, Exhaustive switch, Entity interfaces | MEDIUM | 1-2 days |
| **5** | UI style memoization | LOW | 0.5 days |

**Total Estimated Effort:** 7-11 days

---

## Expected Score Improvements

| Phase | Categories Improved | Score Impact |
|-------|---------------------|--------------|
| 1 | Economic Integrity, Persistence, PostgreSQL, Anti-Cheat, OWASP | +0.5 |
| 2 | Best Practices (Testing) | +0.3 |
| 3 | SOLID, GRASP, Code Organization | +0.4 |
| 4 | Production Quality, TypeScript Rigor, Clean Code, Law of Demeter | +0.3 |
| 5 | UI Integration | +0.1 |

**Expected Final Score:** 8.2 + 1.6 = **9.8/10**

---

## Verification Checklist

After implementation, verify:

- [ ] `bun run build` passes
- [ ] `npm run lint` passes
- [ ] All new tests pass (`npm test`)
- [ ] Manual test: Complete duel flow (challenge → rules → stakes → confirm → fight → resolution)
- [ ] Manual test: Stake add/remove with database transaction logging
- [ ] Manual test: Disconnect during combat (30-second grace period)
- [ ] Verify audit logs appear for stake operations
- [ ] Verify rate limiting blocks rapid stake operations
- [ ] No console.log debug spam in production mode

---

## Files Changed Summary

### New Files
- `packages/server/src/services/AuditLogger.ts`
- `packages/server/src/services/Logger.ts`
- `packages/server/src/systems/DuelSystem/config.ts`
- `packages/server/src/systems/DuelSystem/DuelSessionManager.ts`
- `packages/server/src/systems/DuelSystem/DuelStateTransitionManager.ts`
- `packages/server/src/systems/DuelSystem/DuelCombatResolver.ts`
- `packages/server/src/systems/DuelSystem/DuelArenaEnforcer.ts`
- `packages/server/src/systems/DuelSystem/__tests__/DuelSystem.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/PendingDuelManager.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/ArenaPoolManager.test.ts`
- `packages/server/src/systems/DuelSystem/__tests__/mocks.ts`
- `packages/shared/src/types/entities/player-interface.ts`

### Modified Files
- `packages/server/src/systems/ServerNetwork/handlers/duel/stakes.ts`
- `packages/server/src/systems/ServerNetwork/handlers/duel/challenge.ts`
- `packages/server/src/systems/ServerNetwork/handlers/duel/helpers.ts`
- `packages/server/src/systems/DuelSystem/index.ts`
- `packages/server/src/systems/DuelSystem/PendingDuelManager.ts`
- `packages/server/src/systems/DuelSystem/ArenaPoolManager.ts`
- `packages/shared/src/types/systems/system-interfaces.ts`
- `packages/shared/src/core/World.ts`
- `packages/client/src/game/panels/DuelPanel/RulesScreen.tsx`
- `packages/client/src/game/panels/DuelPanel/StakesScreen.tsx`
- `packages/client/src/game/panels/DuelPanel/ConfirmScreen.tsx`
