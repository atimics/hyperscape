/**
 * Duel Handlers - Barrel Export
 *
 * All duel-related packet handlers organized into focused modules:
 *
 * - challenge.ts: Duel challenge initiation and response
 * - helpers.ts: Shared utilities (not exported externally)
 *
 * Future modules (to be added in later phases):
 * - rules.ts: Toggle rules, accept rules
 * - stakes.ts: Add, remove, accept stakes
 * - confirmation.ts: Final confirmation handlers
 * - combat.ts: Forfeit handler
 */

// Challenge handlers
export { handleDuelChallenge, handleDuelChallengeRespond } from "./challenge";
