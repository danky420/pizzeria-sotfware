-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "iconAssetId" TEXT,
ADD COLUMN     "iconKey" TEXT;

-- CreateTable
CREATE TABLE "CategoryIcon" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryIcon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryIcon_categoryId_idx" ON "CategoryIcon"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_iconAssetId_key" ON "MenuCategory"("iconAssetId");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_iconAssetId_fkey" FOREIGN KEY ("iconAssetId") REFERENCES "CategoryIcon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryIcon" ADD CONSTRAINT "CategoryIcon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

