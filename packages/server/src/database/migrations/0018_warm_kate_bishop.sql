CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"playerId" text NOT NULL,
	"eventType" text NOT NULL,
	"action" text NOT NULL,
	"entityType" text,
	"entityId" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" jsonb,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiatorId" text,
	"receiverId" text,
	"status" text NOT NULL,
	"initiatorItems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"receiverItems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"initiatorCoins" integer DEFAULT 0 NOT NULL,
	"receiverCoins" integer DEFAULT 0 NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"bannedUserId" text NOT NULL,
	"bannedByUserId" text NOT NULL,
	"reason" text,
	"expiresAt" bigint,
	"createdAt" bigint DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "prayerLevel" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "smithingLevel" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "prayerXp" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "smithingXp" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "prayerPoints" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "prayerMaxPoints" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "activePrayers" text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "player_deaths" ADD COLUMN "items" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_deaths" ADD COLUMN "killedBy" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_deaths" ADD COLUMN "recovered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_playerId_characters_id_fk" FOREIGN KEY ("playerId") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_initiatorId_characters_id_fk" FOREIGN KEY ("initiatorId") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_receiverId_characters_id_fk" FOREIGN KEY ("receiverId") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_bannedUserId_users_id_fk" FOREIGN KEY ("bannedUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_bannedByUserId_users_id_fk" FOREIGN KEY ("bannedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_log_player" ON "activity_log" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "idx_activity_log_timestamp" ON "activity_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_activity_log_player_timestamp" ON "activity_log" USING btree ("playerId","timestamp");--> statement-breakpoint
CREATE INDEX "idx_activity_log_event_type" ON "activity_log" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "idx_activity_log_player_event_type" ON "activity_log" USING btree ("playerId","eventType","timestamp");--> statement-breakpoint
CREATE INDEX "idx_trades_initiator" ON "trades" USING btree ("initiatorId");--> statement-breakpoint
CREATE INDEX "idx_trades_receiver" ON "trades" USING btree ("receiverId");--> statement-breakpoint
CREATE INDEX "idx_trades_timestamp" ON "trades" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_trades_initiator_timestamp" ON "trades" USING btree ("initiatorId","timestamp");--> statement-breakpoint
CREATE INDEX "idx_trades_receiver_timestamp" ON "trades" USING btree ("receiverId","timestamp");--> statement-breakpoint
CREATE INDEX "idx_user_bans_banned_user" ON "user_bans" USING btree ("bannedUserId");--> statement-breakpoint
CREATE INDEX "idx_user_bans_active" ON "user_bans" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_user_bans_active_banned" ON "user_bans" USING btree ("active","bannedUserId");--> statement-breakpoint
CREATE INDEX "idx_player_deaths_recovered" ON "player_deaths" USING btree ("recovered");--> statement-breakpoint
CREATE INDEX "idx_player_deaths_recovery_lookup" ON "player_deaths" USING btree ("recovered","timestamp");