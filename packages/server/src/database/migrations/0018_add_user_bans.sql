-- Migration: Add user_bans table for moderation system
-- This table stores ban records for users who have been banned by moderators or admins.

CREATE TABLE IF NOT EXISTS "user_bans" (
    "id" SERIAL PRIMARY KEY,
    "bannedUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "bannedByUserId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
    "reason" TEXT,
    "expiresAt" BIGINT,
    "createdAt" BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    "active" INTEGER NOT NULL DEFAULT 1
);

-- Indexes for efficient ban lookups
CREATE INDEX IF NOT EXISTS "idx_user_bans_banned_user" ON "user_bans" ("bannedUserId");
CREATE INDEX IF NOT EXISTS "idx_user_bans_active" ON "user_bans" ("active");
CREATE INDEX IF NOT EXISTS "idx_user_bans_active_banned" ON "user_bans" ("active", "bannedUserId");

-- Comment: To check if a user is banned:
-- SELECT * FROM user_bans 
-- WHERE "bannedUserId" = ? AND active = 1 
-- AND ("expiresAt" IS NULL OR "expiresAt" > NOW_MS);
