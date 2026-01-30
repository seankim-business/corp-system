-- CreateTable
CREATE TABLE "mega_app_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "default_permissions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mega_app_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "module_id" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "mega_app_role_id" UUID,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_execute" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "can_configure" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "data_scope" VARCHAR(50) NOT NULL DEFAULT 'own',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_permissions_pkey" PRIMARY KEY ("id")
);

-- AlterTable - Add mega_app_role_id to memberships
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "mega_app_role_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "mega_app_roles_organization_id_name_key" ON "mega_app_roles"("organization_id", "name");
CREATE INDEX "mega_app_roles_organization_id_idx" ON "mega_app_roles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_permissions_org_module_user_key" ON "module_permissions"("organization_id", "module_id", "user_id");
CREATE UNIQUE INDEX "module_permissions_org_module_role_key" ON "module_permissions"("organization_id", "module_id", "mega_app_role_id");
CREATE INDEX "module_permissions_organization_id_idx" ON "module_permissions"("organization_id");

-- AddForeignKey
ALTER TABLE "mega_app_roles" ADD CONSTRAINT "mega_app_roles_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_mega_app_role_id_fkey"
    FOREIGN KEY ("mega_app_role_id") REFERENCES "mega_app_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_mega_app_role_id_fkey"
    FOREIGN KEY ("mega_app_role_id") REFERENCES "mega_app_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
