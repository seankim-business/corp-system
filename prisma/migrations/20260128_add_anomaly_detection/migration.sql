-- Anomaly Detection & Alerting Tables
-- Migration for adding anomaly detection and alert management

-- CreateTable: Anomaly
CREATE TABLE "anomalies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "expected_value" DOUBLE PRECISION NOT NULL,
    "actual_value" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "agent_id" UUID,
    "time_range_start" TIMESTAMPTZ(6) NOT NULL,
    "time_range_end" TIMESTAMPTZ(6) NOT NULL,
    "suggested_actions" TEXT[] NOT NULL,
    "auto_resolvable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Alert
CREATE TABLE "alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "anomaly_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "notified_channels" VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    "notified_users" UUID[] DEFAULT ARRAY[]::UUID[],
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "resolution" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Anomaly indexes
CREATE INDEX "anomalies_organization_id_type_idx" ON "anomalies"("organization_id", "type");
CREATE INDEX "anomalies_organization_id_severity_idx" ON "anomalies"("organization_id", "severity");
CREATE INDEX "anomalies_organization_id_created_at_idx" ON "anomalies"("organization_id", "created_at" DESC);
CREATE INDEX "anomalies_agent_id_idx" ON "anomalies"("agent_id");

-- CreateIndex: Alert indexes
CREATE INDEX "alerts_organization_id_status_idx" ON "alerts"("organization_id", "status");
CREATE INDEX "alerts_organization_id_created_at_idx" ON "alerts"("organization_id", "created_at" DESC);
CREATE INDEX "alerts_anomaly_id_idx" ON "alerts"("anomaly_id");
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- AddForeignKey: Anomaly -> Organization
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Alert -> Organization
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Alert -> Anomaly
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
