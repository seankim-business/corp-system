-- Add OrchestratorExecution table (separate from workflow_executions)

CREATE TABLE "orchestrator_executions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "session_id" VARCHAR(255) NOT NULL,
  "category" VARCHAR(100) NOT NULL,
  "skills" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
  "status" VARCHAR(50) NOT NULL,
  "duration" INTEGER NOT NULL DEFAULT 0,
  "input_data" JSONB,
  "output_data" JSONB,
  "error_message" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "orchestrator_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orchestrator_executions_organization_id_created_at_idx"
  ON "orchestrator_executions"("organization_id", "created_at" DESC);

CREATE INDEX "orchestrator_executions_user_id_created_at_idx"
  ON "orchestrator_executions"("user_id", "created_at" DESC);

CREATE INDEX "orchestrator_executions_session_id_idx"
  ON "orchestrator_executions"("session_id");

CREATE INDEX "orchestrator_executions_status_idx"
  ON "orchestrator_executions"("status");

ALTER TABLE "orchestrator_executions"
  ADD CONSTRAINT "orchestrator_executions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orchestrator_executions"
  ADD CONSTRAINT "orchestrator_executions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
