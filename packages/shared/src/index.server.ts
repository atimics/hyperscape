/**
 * index.server.ts - @hyperscape/shared SERVER ONLY Entry Point
 *
 * Lightweight server-specific exports that EXCLUDE:
 * - Client systems (ClientGraphics, ClientLiveKit, ClientInput, etc.)
 * - WebGPU renderer utilities (createRenderer, PostProcessing, etc.)
 * - Browser-only UI/display code (ControlPriorities, isTouch, etc.)
 * - Scene graph node classes (Node, Mesh, Avatar, Group, UI, etc.)
 * - TSL shader language and Node Materials
 * - Load testing utilities
 *
 * The esbuild server build uses a resolve plugin to redirect
 * "./extras/three/three" → "./extras/three/three.server" so that
 * World and other classes use standard Three.js (no WebGPU renderer),
 * saving ~150MB+ heap memory at runtime.
 *
 * Used by: Server package (packages/server)
 * Built as: build/framework.server.js
 */

// ============================================================================
// WORLD FACTORIES
// ============================================================================
// Only server-relevant factories (no client/viewer/node-client)
export { createServerWorld } from "./runtime/createServerWorld";

// ============================================================================
// CORE CLASSES
// ============================================================================
export { World } from "./core/World";
export type { World as WorldType } from "./core/World";
export { Entity } from "./entities/Entity";
export type { EventCallback } from "./entities/Entity";
export { System } from "./systems/shared";
export { SystemBase } from "./systems/shared";
export { Component } from "./components/Component";

// ============================================================================
// ENTITY CLASSES
// ============================================================================
export { PlayerEntity } from "./entities/player/PlayerEntity";
export { PlayerLocal } from "./entities/player/PlayerLocal";
export { PlayerRemote } from "./entities/player/PlayerRemote";
export { MobEntity } from "./entities/npc/MobEntity";

// ============================================================================
// TYPES - All type exports from types/index.ts (zero runtime cost)
// ============================================================================
export type {
  Anchors,
  Chat,
  ChatMessage,
  Component as ComponentInterface,
  Entity as EntityInterface,
  Events,
  HotReloadable,
  Matrix4,
  NetworkConnection,
  PhysicsOptions,
  Player,
  PlayerInput,
  Quaternion,
  Settings,
  Stage,
  System as SystemInterface,
  Vector3,
  World as WorldInterface,
  WorldOptions,
  ClientMonitor,
  ServerDB,
  NodeData,
  Position3D,
  RaycastHit,
  NetworkData,
  GLBData,
  BaseEnvironment,
  EnvironmentModel,
  SkyHandle,
  SkyInfo,
  SkyNode,
  AudioGroupGains,
  ControlBinding,
  ControlsBinding,
  ControlAction,
  TouchInfo,
  ControlEntry,
  ButtonEntry,
  MouseInput,
  ValueEntry,
  VectorEntry,
  ScreenEntry,
  PointerEntry,
  InputState,
  SettingsData,
  CharacterController,
  CharacterControllerOptions,
  NetworkPacket,
  VideoFactory,
  LoadedModel,
  LoadedEmote,
  LoadedAvatar,
  SnapshotData,
  VideoSource,
  HSNode,
  Collider,
  RigidBody,
  PhysicsMaterial,
  LoaderResult,
  ComponentDefinition,
  EntityData,
  Entities as EntitiesInterface,
  PlayerEntity as PlayerEntityType,
} from "./types/index";

// ============================================================================
// NETWORKING TYPES
// ============================================================================
export type {
  ConnectionParams,
  NetworkWithSocket,
  NodeWebSocket,
  ServerStats,
  SpawnData,
  User,
  Socket as SocketInterface,
  SocketOptions,
  NetworkMetrics,
  MovementValidationResult,
  MovementConfig,
} from "./types/network/networking";

// Socket class
export { Socket } from "./platform/shared/Socket";

// ============================================================================
// EVENT TYPES
// ============================================================================
export { EventType } from "./types/events";
export type { EventMap } from "./types/events";
export type {
  AnyEvent,
  EventType as EventTypeEnum,
  EventPayloads,
} from "./types/events";
export * as Payloads from "./types/events";
export type {
  SkillsLevelUpEvent,
  EquipmentSyncData,
  InventorySyncData,
  FletchingInterfaceOpenPayload,
  InventoryCanAddEvent,
  InventoryRemoveCoinsEvent,
  InventoryCheckEvent,
  InventoryHasEquippedEvent,
  BankDepositEvent,
  BankWithdrawEvent,
  BankDepositSuccessEvent,
  UIMessageEvent,
  StoreOpenEvent,
  StoreCloseEvent,
  StoreBuyEvent,
  StoreSellEvent,
  InventoryItemInfo,
  ActionBarSlotContent,
  ActionBarSlotUpdatePayload,
  ActionBarSlotSwapPayload,
} from "./types/events";

// ============================================================================
// CORE TYPES AND ENUMS
// ============================================================================
export { PlayerMigration } from "./types/core/core";
export {
  WeaponType,
  EquipmentSlotName,
  AttackType,
  ItemType,
} from "./types/core/core";
export type {
  PlayerDeathData,
  Player as PlayerCore,
  PlayerHealth,
  PlayerStamina,
  PlayerPosition,
  PlayerStats,
  Skills,
  PlayerEquipmentItems,
  PlayerCombatData,
  SystemConfig,
  SkillData,
  MovementComponent,
  InventoryItem,
  InventorySlotItem,
  Item,
  Inventory,
  PlayerEquipment,
  CombatStyle,
  ItemRarity,
  CombatBonuses,
  EquipmentSlot,
} from "./types/core/core";

// Death/respawn state
export { DeathState } from "./types/entities/entities";

// Death/loot types
export type {
  LootResult,
  LootFailureReason,
  PendingLootTransaction,
  DeathAuditEntry,
  DeathAuditAction,
  DeathItemData,
  DeathLock,
} from "./types/death";

// ============================================================================
// DATABASE TYPES AND HELPERS
// ============================================================================
export { dbHelpers, isDatabaseInstance } from "./types/network/database";
export type {
  SystemDatabase,
  TypedKnexDatabase,
  ConfigRow,
  UserRow,
  EntityRow,
  DatabaseRow,
  PlayerRow,
  ItemRow,
  InventoryRow,
  EquipmentRow,
  PlayerSessionRow,
  WorldChunkRow,
  InventorySaveItem,
  EquipmentSaveItem,
} from "./types/network/database";

// Storage (server-side NodeStorage)
export { NodeStorage } from "./storage.server";
export type { Storage } from "./platform/shared/storage";

// ============================================================================
// BRANDED TYPE IDENTIFIERS
// ============================================================================
export type {
  PlayerID,
  ItemID,
  MobID,
  EntityID,
  StoreID,
  BankID,
  ResourceID,
  NPCID,
  SessionID,
  QuestID,
  SkillID,
  ZoneID,
  ChunkID,
  SlotNumber,
} from "./types/core/identifiers";
export {
  isValidPlayerID,
  isValidMobID,
  isValidEntityID,
  isValidItemID,
  isValidStoreID,
  isValidBankID,
  isValidResourceID,
  isValidNPCID,
  isValidSessionID,
  isValidSlotNumber,
  isValidQuestID,
  isValidSkillID,
  isValidZoneID,
  isValidChunkID,
  createPlayerID,
  createMobID,
  createEntityID,
  createItemID,
  createStoreID,
  createBankID,
  createResourceID,
  createNPCID,
  createSessionID,
  createSlotNumber,
  createQuestID,
  createSkillID,
  createZoneID,
  createChunkID,
} from "./types/core/identifiers";

// ============================================================================
// UTILITIES
// ============================================================================
export {
  addRole,
  removeRole,
  hasRole,
  serializeRoles,
  hasModPermission,
  hasAdminPermission,
  isProtectedFromModAction,
  uuid,
} from "./utils/index";

export { generateTransactionId } from "./utils/IdGenerator";

export {
  SeededRandom,
  initializeGameRng,
  getGameRng,
  getGameSeed,
  getGameRngState,
} from "./utils/SeededRandom";
export type { SeededRandomState } from "./utils/SeededRandom";

export {
  isNumber,
  isBoolean,
  isString,
  isObject,
  isArray,
  isValidColor,
  isValidUrl,
  validatePosition,
  calculateDistance,
  calculateDistance2D,
} from "./utils/ValidationUtils";

export {
  validateEntityId,
  validateUUID,
  validateAttackType,
  validateCombatRequest,
  validateAttackStyleRequest,
  sanitizeDisplayName,
  type CombatRequestValidation,
  type AttackStyleValidation,
} from "./utils/game/CombatValidation";

export { SystemLogger } from "./utils/Logger";
export type { SystemLogger as SystemLoggerType } from "./utils/Logger";

export * from "./utils/typeGuards";

// ============================================================================
// PHYSICS UTILITIES
// ============================================================================
export { installThreeJSExtensions } from "./utils/physics/PhysicsUtils";
export { CircularSpawnArea } from "./utils/physics/CircularSpawnArea";
export { LooseOctree } from "./utils/physics/LooseOctree";
export type {
  LooseOctreeNode,
  OctreeHelper,
  LooseOctreeOptions,
} from "./utils/physics/LooseOctree";

export {
  loadPhysX,
  waitForPhysX,
  getPhysX,
  isPhysXReady,
} from "./physics/PhysXManager";

export { quaternionPool } from "./utils/pools/QuaternionPool";
export type { PooledQuaternion } from "./utils/pools/QuaternionPool";

// PhysX types
export type {
  PxVec3,
  PxTransform,
  PxQuat,
  PxSphereGeometry,
  PxCapsuleGeometry,
  PxScene,
  PxFoundation,
  PxTolerancesScale,
  PxCookingParams,
  PxPhysics,
  PxMaterial,
  PxRaycastResult,
  PxSweepResult,
  PxOverlapResult,
  PxControllerManager,
  PxControllerFilters,
  PxActor,
  PxRigidDynamic,
  PxRigidStatic,
  PxRigidBody,
  PxShape,
  PxGeometry,
  PxDefaultAllocator,
  PxDefaultErrorCallback,
  PxQueryFilterData,
  PhysXInfo,
  PhysXModule,
  InterpolatedPhysicsHandle,
  NonInterpolatedPhysicsHandle,
  ActorHandle,
  PxControllerCollisionFlags,
  PxRigidBodyFlagEnum,
  OctreeItem,
  ExtendedIntersection,
  RenderHelperItem,
  GeometryPhysXMesh,
  PhysicsHandle,
  PhysicsRaycastHit,
  PhysicsOverlapHit,
  BasePhysicsHandle,
  InterpolationData,
  ContactEvent,
  TriggerEvent,
  PlayerTouch,
  PlayerStickState,
  MinimalHotReloadable,
} from "./types/systems/physics";

// ============================================================================
// SHARED SYSTEMS
// ============================================================================
export { Entities } from "./systems/shared";
export { Physics } from "./systems/shared";
export { Particles } from "./systems/shared";
export { LODs } from "./systems/shared";
export { Environment } from "./systems/shared";
export { EventBus } from "./systems/shared";
export { System as SystemClass } from "./systems/shared";
export { TerrainSystem } from "./systems/shared";
export { TownSystem } from "./systems/shared";
export { RoadNetworkSystem } from "./systems/shared";
export { CombatSystem } from "./systems/shared/combat";
export { PrayerSystem } from "./systems/shared/character/PrayerSystem";
export { LootSystem } from "./systems/shared/economy/LootSystem";
export { StoreSystem } from "./systems/shared/economy/StoreSystem";
export { ResourceSystem } from "./systems/shared/entities/ResourceSystem";
export { QuestSystem } from "./systems/shared/progression/QuestSystem";

export type { PhysXShape, PhysXMesh } from "./systems/shared";
export type { SystemConstructor, SystemDependencies } from "./systems/shared";
export type {
  EventSubscription,
  SystemEvent,
  EventHandler,
} from "./systems/shared";
export type { IEventsInterface } from "./systems/shared";
export type { ChatListener } from "./systems/shared";
export type {
  MaterialWrapper,
  InsertOptions,
  StageHandle,
  MaterialOptions,
} from "./systems/shared";
export type {
  InternalContactCallback,
  InternalTriggerCallback,
  ExtendedContactEvent,
  ExtendedTriggerEvent,
  OverlapHit,
} from "./systems/shared";

// Server systems
export { ServerRuntime } from "./systems/server/ServerRuntime";
export { ServerLoader } from "./systems/server/ServerLoader";

// ============================================================================
// TILE MOVEMENT SYSTEM
// ============================================================================
export {
  TILE_SIZE,
  TICK_DURATION_MS,
  TILES_PER_TICK_WALK,
  TILES_PER_TICK_RUN,
  MAX_PATH_LENGTH,
  PATHFIND_RADIUS,
  TILE_DIRECTIONS,
  worldToTile,
  worldToTileInto,
  tileToWorld,
  tileToWorldInto,
  snapToTileCenter,
  tileManhattanDistance,
  tileChebyshevDistance,
  tilesEqual,
  tilesAdjacent,
  tilesWithinRange,
  tilesWithinMeleeRange,
  tilesCardinallyAdjacent,
  getBestAdjacentTile,
  getBestCombatRangeTile,
  getBestMeleeTile,
  getBestUnoccupiedMeleeTile,
  getBestStepOutTile,
  getAdjacentTiles,
  getResourceAdjacentTiles,
  findBestResourceInteractionTile,
  isAdjacentToResource,
  getCardinalAdjacentTiles,
  findBestCardinalInteractionTile,
  isCardinallyAdjacentToResource,
  getCardinalFaceDirection,
  getCardinalFaceAngle,
  CARDINAL_FACE_ANGLES,
  isDiagonal,
  tileKey,
  parseTileKey,
  clampTile,
  createTileMovementState,
} from "./systems/shared/movement/TileSystem";
export type {
  TileCoord,
  TileMovementState,
  TileFlags,
  CardinalDirection,
} from "./systems/shared/movement/TileSystem";

export { BFSPathfinder } from "./systems/shared/movement/BFSPathfinder";
export {
  chaseStep,
  getChasePathfinder,
  ChasePathfinder,
} from "./systems/shared/movement/ChasePathfinding";
export type { WalkabilityChecker } from "./systems/shared/movement/BFSPathfinder";

export {
  getCachedTimestamp,
  updateCachedTimestamp,
} from "./systems/shared/movement/ObjectPools";

export {
  CollisionFlag,
  CollisionMask,
} from "./systems/shared/movement/CollisionFlags";
export {
  CollisionMatrix,
  ZONE_SIZE,
} from "./systems/shared/movement/CollisionMatrix";
export type { ICollisionMatrix } from "./systems/shared/movement/CollisionMatrix";

// ============================================================================
// GAME DATA
// ============================================================================
export {
  getItem,
  getBaseItem,
  getNotedItem,
  canBeNoted,
  isNotedItemId,
  getBaseItemId,
  getNotedItemId,
  NOTE_SUFFIX,
} from "./data/items";

export { getStoreById } from "./data/banks-stores";
export { AVATAR_OPTIONS } from "./data/avatars";
export { Emotes } from "./data/playerEmotes";
export { ALL_WORLD_AREAS, STARTER_TOWNS } from "./data/world-areas";
export { prayerDataProvider } from "./data/PrayerDataProvider";

export {
  SKILL_ICONS,
  getSkillIcon,
  SKILL_DEFINITIONS,
  getSkillDefinition,
  getSkillsByCategory,
  type SkillDefinition,
  type SkillCategory,
} from "./data/skill-icons";

export {
  SKILL_UNLOCKS,
  getUnlocksAtLevel,
  getUnlocksUpToLevel,
  getUnlocksForSkill,
  getAllSkillUnlocks,
  clearSkillUnlocksCache,
  loadSkillUnlocks,
  isSkillUnlocksLoaded,
  resetSkillUnlocks,
} from "./data/skill-unlocks";
export type {
  SkillUnlock,
  UnlockType,
  SkillUnlocksManifest,
} from "./data/skill-unlocks";

// Item helpers
export {
  isFood,
  isPotion,
  isBone,
  isWeapon,
  isShield,
  usesWield,
  usesWear,
  isNotedItem,
  getPrimaryAction,
  getPrimaryActionFromManifest,
  HANDLED_INVENTORY_ACTIONS,
} from "./utils/item-helpers";
export type { PrimaryActionType } from "./utils/item-helpers";

// ============================================================================
// SPELL SERVICE
// ============================================================================
export { spellService } from "./systems/shared/combat/SpellService";
export type { Spell } from "./systems/shared/combat/SpellService";

// ============================================================================
// PRAYER TYPES
// ============================================================================
export {
  isValidPrayerId,
  isValidPrayerTogglePayload,
  isValidPrayerBonuses,
  getPlayerPrayerLevel,
  getPlayerPrayerBonus,
  getPlayerPrayerXp,
  MAX_PRAYER_ID_LENGTH,
  MAX_ACTIVE_PRAYERS,
  PRAYER_TOGGLE_COOLDOWN_MS,
  PRAYER_TOGGLE_RATE_LIMIT,
  PRAYER_ID_PATTERN,
} from "./types/game/prayer-types";
export type {
  PrayerCategory,
  PrayerBonuses,
  PrayerDefinition,
  PrayerManifest,
  PrayerState,
  PrayerTogglePayload,
  PrayerToggledEvent,
  PrayerStateSyncPayload,
  PlayerWithPrayerStats,
} from "./types/game/prayer-types";

// ============================================================================
// TRADE TYPES
// ============================================================================
export { TRADE_CONSTANTS } from "./types/game/trade-types";
export type {
  TradeStatus,
  TradeCancelReason,
  TradeOfferItem,
  TradeParticipant,
  TradeSession,
  TradeRequestPayload,
  TradeRequestRespondPayload,
  TradeAddItemPayload,
  TradeRemoveItemPayload,
  TradeSetQuantityPayload,
  TradeAcceptPayload,
  TradeCancelAcceptPayload,
  TradeCancelPayload,
  TradeIncomingPayload,
  TradeStartedPayload,
  TradeOfferView,
  TradeUpdatedPayload,
  TradeCompletedPayload,
  TradeCancelledPayload,
  TradeErrorPayload,
  TradeWindowState,
  TradeRequestModalState,
} from "./types/game/trade-types";

// ============================================================================
// SOCIAL/FRIEND TYPES
// ============================================================================
export { SOCIAL_CONSTANTS } from "./types/game/social-types";
export type {
  FriendStatus,
  Friend,
  FriendStatusUpdateData,
  FriendRequest,
  IgnoredPlayer,
  PrivateMessage,
  PrivateChatFailReason,
  FriendsListSyncData,
  SocialErrorCode,
  SocialError,
} from "./types/game/social-types";

// ============================================================================
// DUEL TYPES
// ============================================================================
export {
  DEFAULT_DUEL_RULES,
  validateRuleCombination,
  INVALID_RULE_COMBINATIONS,
  DEFAULT_EQUIPMENT_RESTRICTIONS,
  createDuelParticipant,
  DUEL_CHALLENGE_TIMEOUT_MS,
  DuelErrorCode,
  DuelEvents,
} from "./types/game/duel-types";
export type {
  DuelRules,
  EquipmentSlotRestriction,
  EquipmentRestrictions,
  StakedItem,
  DuelParticipant,
  DuelState,
  DuelSession,
  ArenaSpawnPoint,
  ArenaBounds,
  Arena,
  PendingDuelChallenge,
  DuelEventName,
} from "./types/game/duel-types";

export { isValidQuestId } from "./types/game/quest-types";

export {
  DUEL_RULE_DEFINITIONS,
  DUEL_RULE_LABELS,
  EQUIPMENT_SLOT_DEFINITIONS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS_ORDERED,
  VALID_DUEL_RULE_KEYS,
  DUEL_EQUIPMENT_SLOT_KEYS,
  isValidDuelRuleKey,
  isValidEquipmentSlot,
  getIncompatibleRules,
  areRulesCompatible,
  getDuelArenaConfig,
  isPositionInsideCombatArena,
  type DuelRuleDefinition,
  type EquipmentSlotDefinition,
  type DuelEquipmentSlot,
  type DuelArenaConfig,
} from "./data/duel-manifest";

// ============================================================================
// RESOURCE TYPES
// ============================================================================
export {
  FOOTPRINT_SIZES,
  resolveFootprint,
} from "./types/game/resource-processing-types";
export type {
  ResourceFootprint,
  FootprintDimensions,
  FootprintSpec,
  Resource,
  Fire,
} from "./types/game/resource-processing-types";

// ============================================================================
// CONSTANTS
// ============================================================================
export {
  SessionType,
  INTERACTION_DISTANCE,
  TRANSACTION_RATE_LIMIT_MS,
  SESSION_CONFIG,
  INPUT_LIMITS,
} from "./constants/interaction";

export { COMBAT_CONSTANTS } from "./constants/CombatConstants";
export { HOME_TELEPORT_CONSTANTS } from "./constants/GameConstants";
export { INVENTORY_CONSTANTS } from "./constants/GameConstants";
export { PLAYER_CONSTANTS } from "./constants/GameConstants";
export { CONTEXT_MENU_COLORS } from "./constants/GameConstants";
export { GATHERING_CONSTANTS } from "./constants/GatheringConstants";

export {
  WEAPON_STYLE_CONFIG,
  getAvailableStyles,
  isStyleValidForWeapon,
  getDefaultStyleForWeapon,
} from "./constants/WeaponStyleConfig";

// ============================================================================
// HIT DELAY CALCULATOR
// ============================================================================
export {
  calculateHitDelay,
  calculateMeleeHitDelay,
  calculateRangedHitDelay,
  calculateMagicHitDelay,
  calculateTileDistance,
  calculateEuclideanDistance,
  createProjectile,
  shouldProjectileHit,
  getProjectileProgress,
  getHitDelayExamples,
} from "./utils/game/HitDelayCalculator";
export type {
  HitDelayAttackType,
  ProjectileData,
  HitDelayResult,
} from "./utils/game/HitDelayCalculator";

// Distance utilities
export {
  chebyshevDistance,
  isWithinDistance,
  type Position2D,
} from "./utils/distance";

// ============================================================================
// INTERACTION TYPES
// ============================================================================
export type {
  InteractionSession,
  ISessionReader,
  ISessionWriter,
  ISessionManager,
  ITransactionValidator,
  IRateLimiter,
  ValidationResult,
  SessionCloseReason,
} from "./types/interaction";

// ============================================================================
// BANK EQUIPMENT
// ============================================================================
export {
  isValidPlayerEquipmentData,
  isValidPlayerEquipmentStructure,
  MVP_EQUIPMENT_SLOTS,
} from "./types/bank-equipment";
export { VALID_EQUIPMENT_SLOT_KEYS } from "./constants/BankEquipmentConstants";
export type {
  PlayerEquipmentData,
  EquipmentSlotItem,
  BankEquipmentError,
  BankRightPanelMode,
  WithdrawTarget,
  BankWithdrawToEquipmentRequest,
  BankWithdrawToEquipmentResponse,
  BankDepositEquipmentRequest,
  BankDepositEquipmentResponse,
} from "./types/bank-equipment";

// ============================================================================
// NETWORK SYSTEM TYPES
// ============================================================================
export type {
  NetworkSystem,
  EquipmentSystem,
  SkillsData,
} from "./types/systems/system-interfaces";

// ============================================================================
// ENTITY TYPES
// ============================================================================
export type {
  EntityConfig,
  EntityInteractionData,
  BaseEntityProperties,
  EntityType,
  InteractionType,
  HealthComponent,
  VisualComponent,
  EntityCombatComponent,
  PlayerCombatStyle,
} from "./types/entities";

// ============================================================================
// RENDERING TYPES (types only - no runtime rendering code)
// ============================================================================
export type {
  UIData,
  UIViewData,
  DisplayType,
  EdgeValue,
  FlexBasis,
  UIContext,
  UISceneItem,
  UIYogaNode,
  UITextData,
  TextAlign,
  FontWeight,
  UIImageData,
  UIPointerEvent,
  UIWheelEvent,
  RigidBodyData,
  MeshData,
  SkinnedMeshData,
  SkyData,
  ActionData,
  DistanceModelType,
  LODItem,
  LODNode,
  LODData,
  AvatarData,
  VRMAvatarFactory,
  AvatarHooks,
  VRMAvatarInstance,
  ControllerData,
  ColliderData,
  JointData,
  ParticlesData,
  PhysicsTriggerEvent,
  PhysicsContactEvent,
  JointLimits,
  JointDrive,
  PhysXActor,
  PhysXController,
  PhysXJoint,
  PxJointLimitCone,
  PxConstraintFlag,
  PxJointAngularLimitPair,
  PxRigidBodyFlag,
  PhysXMoveFlags,
  AudioData,
  ImageData,
  GroupType,
  UIProxy,
} from "./types/rendering/nodes";

export type {
  ParticleEmitter,
  EmitterNode,
  ParticleMessage,
  ParticleMessageData,
} from "./types/rendering/particles";

export type { MaterialProxy } from "./types/rendering/materials";

// ============================================================================
// PACKETS
// ============================================================================
export {
  writePacket,
  readPacket,
  getPacketId,
  getPacketName,
  PACKET_NAMES,
} from "./platform/shared/packets";

// ============================================================================
// THREE.JS (standard build, NOT WebGPU - redirected at build time)
// ============================================================================
// This import resolves to ./extras/three/three.ts in source, but the
// esbuild server build plugin redirects it to ./extras/three/three.server.ts
// which imports from "three" (standard) instead of "three/webgpu"
export { default as THREE } from "./extras/three/three";

// Vector3 compatibility utilities
export {
  toTHREEVector3,
  assignVector3,
  cloneVector3,
  createVector3,
  toVector3Object,
  isVector3Like,
} from "./extras/animation/vector3-compatibility";

// ============================================================================
// PhysX ASSET PATH HELPER
// ============================================================================
export function getPhysXAssetPath(assetName: string): string {
  // In Node.js, compute path relative to this module
  try {
    const here = new URL(import.meta.url);
    const vendorUrl = new URL(`../vendor/${assetName}`, here);
    return vendorUrl.pathname;
  } catch {
    return assetName;
  }
}
