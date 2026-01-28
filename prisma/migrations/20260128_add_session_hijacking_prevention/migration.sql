-- Add session hijacking prevention fields to sessions table
ALTER TABLE "sessions" ADD COLUMN "ip_address" VARCHAR(45);
ALTER TABLE "sessions" ADD COLUMN "user_agent" TEXT;

-- Create session hijacking attempts audit table
CREATE TABLE "session_hijacking_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "mismatch_type" VARCHAR(50) NOT NULL,
    "expected_ip" VARCHAR(45),
    "actual_ip" VARCHAR(45),
    "expected_user_agent" TEXT,
    "actual_user_agent" TEXT,
    "action" VARCHAR(50) NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "request_path" VARCHAR(255),
    "request_method" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_hijacking_attempts_pkey" PRIMARY KEY ("id")
);

-- Create indexes for session hijacking attempts
CREATE INDEX "session_hijacking_attempts_organization_id_created_at_idx" ON "session_hijacking_attempts"("organization_id" DESC, "created_at" DESC);
CREATE INDEX "session_hijacking_attempts_user_id_created_at_idx" ON "session_hijacking_attempts"("user_id" DESC, "created_at" DESC);
CREATE INDEX "session_hijacking_attempts_session_id_idx" ON "session_hijacking_attempts"("session_id");
CREATE INDEX "session_hijacking_attempts_mismatch_type_idx" ON "session_hijacking_attempts"("mismatch_type");
CREATE INDEX "session_hijacking_attempts_blocked_idx" ON "session_hijacking_attempts"("blocked");
