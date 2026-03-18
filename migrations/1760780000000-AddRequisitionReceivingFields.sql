-- AddRequisitionReceivingFields: safe to run multiple times

ALTER TABLE "requisition_items"
  ADD COLUMN IF NOT EXISTS "receivedQuantity" numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "requisitions"
  ADD COLUMN IF NOT EXISTS "receivedAt" timestamp;

ALTER TABLE "requisitions"
  ADD COLUMN IF NOT EXISTS "receivedById" character varying;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FK_requisitions_receivedBy_teacher'
  ) THEN
    ALTER TABLE "requisitions"
    ADD CONSTRAINT "FK_requisitions_receivedBy_teacher"
    FOREIGN KEY ("receivedById") REFERENCES "teachers"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_requisition_items_receivedQuantity"
  ON "requisition_items" ("receivedQuantity");

