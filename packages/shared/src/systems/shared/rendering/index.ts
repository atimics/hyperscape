/**
 * Rendering Systems
 *
 * Centralized rendering utilities including:
 * - ImpostorManager: On-demand impostor generation and caching with IndexedDB persistence
 * - LODLevel: Enum for entity LOD states
 * - Types for impostor initialization
 */

export {
  ImpostorManager,
  IMPOSTOR_CONFIG,
  BakePriority,
  LODLevel,
  type ImpostorOptions,
  type ImpostorInitOptions,
} from "./ImpostorManager";
