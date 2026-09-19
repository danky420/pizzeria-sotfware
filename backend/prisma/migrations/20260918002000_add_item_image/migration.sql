-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "imageAssetId" TEXT;

-- CreateTable
CREATE TABLE "MenuItemImage" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItemImage_itemId_idx" ON "MenuItemImage"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_imageAssetId_key" ON "MenuItem"("imageAssetId");

-- AddForeignKey
ALTER TABLE "MenuItemImage" ADD CONSTRAINT "MenuItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "MenuItemImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

