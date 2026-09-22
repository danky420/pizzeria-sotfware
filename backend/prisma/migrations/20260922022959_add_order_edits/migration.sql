-- CreateTable
CREATE TABLE "OrderEdit" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "previousTotal" DECIMAL(12,2) NOT NULL,
    "newTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderEdit_orderId_createdAt_idx" ON "OrderEdit"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderEdit" ADD CONSTRAINT "OrderEdit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEdit" ADD CONSTRAINT "OrderEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

