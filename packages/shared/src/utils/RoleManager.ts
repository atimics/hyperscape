/**
 * Role Management Utilities
 *
 * Functions for managing user/player roles (admin, builder, moderator, etc.)
 *
 * **Temporary Roles**:
 * Roles prefixed with `~` (e.g., `~admin`) are considered temporary and:
 * - Are recognized by `hasRole()` checks
 * - Are filtered out by `serializeRoles()` (not persisted to database)
 * - Used for session-specific permissions that shouldn't be saved
 */

/**
 * Checks if a user has any of the specified roles
 *
 * Supports both permanent and temporary roles (prefixed with `~`).
 * Temporary roles are session-only and not persisted to the database.
 *
 * @param arr - Array of role strings (may be null/undefined for guests)
 * @param roles - Roles to check for (e.g., 'admin', 'builder', 'moderator')
 * @returns true if user has any of the specified roles
 *
 * @example
 * hasRole(['admin', 'builder'], 'admin') // => true
 * hasRole(['player'], 'admin') // => false
 * hasRole(['~admin'], 'admin') // => true (temporary admin role)
 * hasRole(null, 'admin') // => false (guest user)
 */
export function hasRole(
  arr: string[] | null | undefined,
  ...roles: string[]
): boolean {
  if (!arr) return false;
  // also includes temporary roles (prefixed with `~`)
  return roles.some(
    (role: string) => arr.includes(role) || arr.includes(`~${role}`),
  );
}

/**
 * Adds a role to a user's role array if not already present
 *
 * @param arr - Array of role strings to modify
 * @param role - Role to add (e.g., 'admin', 'builder')
 *
 * @example
 * const roles = ['player']
 * addRole(roles, 'admin')
 * // roles is now ['player', 'admin']
 */
export function addRole(arr: string[], role: string): void {
  if (!hasRole(arr, role)) {
    arr.push(role);
  }
}

/**
 * Removes a role from a user's role array
 *
 * @param arr - Array of role strings to modify
 * @param role - Role to remove (e.g., 'admin', 'builder')
 *
 * @example
 * const roles = ['player', 'admin']
 * removeRole(roles, 'admin')
 * // roles is now ['player']
 */
export function removeRole(arr: string[], role: string): void {
  const idx = arr.indexOf(role);
  if (idx !== -1) {
    arr.splice(idx, 1);
  }
}

/**
 * Serializes roles to a comma-separated string for database storage
 *
 * Filters out temporary roles (prefixed with `~`) since they should not be persisted.
 *
 * @param roles - Array of role strings
 * @returns Comma-separated string of permanent roles
 *
 * @example
 * serializeRoles(['admin', '~builder', 'player']) // => 'admin,player'
 * serializeRoles(['player']) // => 'player'
 */
export function serializeRoles(roles: string[]): string {
  // remove temporary (~) roles
  roles = roles.filter((role: string) => !role.startsWith("~"));
  // convert to string
  return roles.join(",");
}

/**
 * Role Hierarchy:
 * - user: Basic player, can do normal gameplay actions
 * - mod: Moderator, can use advanced commands like /teleport
 * - admin: Administrator, can do everything mod can + manage mods
 *
 * Role checks should use hasModPermission() or hasAdminPermission() for proper hierarchy.
 */

/**
 * Checks if user has moderator permissions (mod or admin role)
 *
 * Moderators can use advanced commands like /teleport.
 * Admins automatically have mod permissions.
 *
 * @param arr - Array of role strings (may be null/undefined for guests)
 * @returns true if user has mod or admin role
 *
 * @example
 * hasModPermission(['mod']) // => true
 * hasModPermission(['admin']) // => true (admin includes mod permissions)
 * hasModPermission(['user']) // => false
 * hasModPermission(null) // => false
 */
export function hasModPermission(arr: string[] | null | undefined): boolean {
  return hasRole(arr, "mod", "admin");
}

/**
 * Checks if user has administrator permissions (admin role only)
 *
 * Administrators can manage mods (/mod, /demod, /listmods) and have all mod permissions.
 *
 * @param arr - Array of role strings (may be null/undefined for guests)
 * @returns true if user has admin role
 *
 * @example
 * hasAdminPermission(['admin']) // => true
 * hasAdminPermission(['mod']) // => false
 * hasAdminPermission(['user']) // => false
 * hasAdminPermission(null) // => false
 */
export function hasAdminPermission(arr: string[] | null | undefined): boolean {
  return hasRole(arr, "admin");
}

/**
 * Checks if a user is protected from mod actions (kick/ban)
 *
 * Mods and admins cannot be kicked or banned by other mods.
 * Only admins can kick/ban mods, and admins cannot kick/ban other admins.
 *
 * @param targetRoles - Roles of the user being targeted
 * @param actorRoles - Roles of the user performing the action
 * @returns Object with protected status and reason
 *
 * @example
 * isProtectedFromModAction(['mod'], ['mod']) // => { protected: true, reason: "Cannot kick/ban other moderators" }
 * isProtectedFromModAction(['admin'], ['admin']) // => { protected: true, reason: "Cannot kick/ban administrators" }
 * isProtectedFromModAction(['user'], ['mod']) // => { protected: false }
 * isProtectedFromModAction(['mod'], ['admin']) // => { protected: false } (admins can kick mods)
 */
export function isProtectedFromModAction(
  targetRoles: string[] | null | undefined,
  actorRoles: string[] | null | undefined,
): { protected: boolean; reason?: string } {
  // Admins are always protected - nobody can kick/ban them
  if (hasRole(targetRoles, "admin")) {
    return { protected: true, reason: "Cannot kick/ban administrators" };
  }

  // Mods are protected from other mods, but not from admins
  if (hasRole(targetRoles, "mod")) {
    if (!hasRole(actorRoles, "admin")) {
      return {
        protected: true,
        reason: "Cannot kick/ban other moderators. Only admins can do this.",
      };
    }
  }

  return { protected: false };
}
