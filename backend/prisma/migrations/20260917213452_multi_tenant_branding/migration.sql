-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "addressText" TEXT,
ADD COLUMN     "colorScheme" TEXT NOT NULL DEFAULT 'rojo-clasico',
ADD COLUMN     "logoAssetId" TEXT;

-- CreateTable
CREATE TABLE "LocationAsset" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationAsset_locationId_idx" ON "LocationAsset"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_logoAssetId_key" ON "Location"("logoAssetId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "LocationAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAsset" ADD CONSTRAINT "LocationAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
