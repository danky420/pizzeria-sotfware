import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, login, resetDatabase, seedFixture } from "./helpers/db.js";

// A minimal 1x1 transparent PNG -- real bytes, not a placeholder, so a mime
// sniffer would agree it is one.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function buildMultipartBody(
  fieldName: string,
  filename: string,
  contentType: string,
  data: Buffer
): { payload: Buffer; contentTypeHeader: string } {
  const boundary = "----vitestBoundary1234567890";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    contentTypeHeader: `multipart/form-data; boundary=${boundary}`
  };
}

describe.skipIf(!databaseReady)("admin location branding", () => {
  let app: FastifyInstance;
  let fixture: Fixture;
  let ownerA: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
    ownerA = await login(app, "owner@a.test");
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  describe("colorScheme validation", () => {
    it.each(["rojo-clasico", "verde-oliva", "azul-marino"])("accepts %s", async (colorScheme) => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/locations/${fixture.locationA.id}`,
        headers: { cookie: ownerA },
        payload: { colorScheme }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().location.colorScheme).toBe(colorScheme);
    });

    it("rejects an unknown scheme", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/locations/${fixture.locationA.id}`,
        headers: { cookie: ownerA },
        payload: { colorScheme: "azul-cielo" }
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("also accepts addressText on the same partial update", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/locations/${fixture.locationA.id}`,
        headers: { cookie: ownerA },
        payload: { addressText: "Calle Falsa 123, Maltrata" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().location.addressText).toBe("Calle Falsa 123, Maltrata");
    });
  });

  describe("logo upload", () => {
    it("has no logo before any upload", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/admin/locations/${fixture.locationA.id}`,
        headers: { cookie: ownerA }
      });
      expect(response.json().location.logoUrl).toBeNull();

      const publicLogo = await app.inject({
        method: "GET",
        url: `/api/public/locations/${fixture.locationA.slug}/logo`
      });
      expect(publicLogo.statusCode).toBe(404);
    });

    it("rejects a file over the 2MB cap", async () => {
      const oversized = Buffer.alloc(2 * 1024 * 1024 + 1024, 1);
      const { payload, contentTypeHeader } = buildMultipartBody("logo", "big.png", "image/png", oversized);

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationA.id}/logo`,
        headers: { cookie: ownerA, "content-type": contentTypeHeader },
        payload
      });
      expect(response.statusCode).toBe(413);

      const location = await prisma.location.findUniqueOrThrow({ where: { id: fixture.locationA.id } });
      expect(location.logoAssetId).toBeNull();
    });

    it("rejects an unsupported mime type", async () => {
      const { payload, contentTypeHeader } = buildMultipartBody(
        "logo",
        "logo.svg",
        "image/svg+xml",
        ONE_PIXEL_PNG
      );

      const response = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationA.id}/logo`,
        headers: { cookie: ownerA, "content-type": contentTypeHeader },
        payload
      });
      expect(response.statusCode).toBe(400);
    });

    it("accepts a valid upload and serves it back publicly", async () => {
      const { payload, contentTypeHeader } = buildMultipartBody(
        "logo",
        "logo.png",
        "image/png",
        ONE_PIXEL_PNG
      );

      const upload = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationA.id}/logo`,
        headers: { cookie: ownerA, "content-type": contentTypeHeader },
        payload
      });
      expect(upload.statusCode).toBe(201);
      const location = upload.json().location;
      expect(location.logoUrl).toBe(`/api/public/locations/${fixture.locationA.slug}/logo`);

      const publicLogo = await app.inject({ method: "GET", url: location.logoUrl });
      expect(publicLogo.statusCode).toBe(200);
      expect(publicLogo.headers["content-type"]).toBe("image/png");
      expect(publicLogo.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(Buffer.compare(publicLogo.rawPayload, ONE_PIXEL_PNG)).toBe(0);
    });

    it("orphans the old asset instead of mutating it when a new logo replaces it", async () => {
      const before = await prisma.location.findUniqueOrThrow({ where: { id: fixture.locationA.id } });
      const firstAssetId = before.logoAssetId;
      expect(firstAssetId).not.toBeNull();

      // A different one-pixel PNG (still tiny, still real bytes) so the two
      // uploads are distinguishable by content.
      const secondPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      );
      const { payload, contentTypeHeader } = buildMultipartBody(
        "logo",
        "logo2.png",
        "image/png",
        secondPng
      );

      const upload = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationA.id}/logo`,
        headers: { cookie: ownerA, "content-type": contentTypeHeader },
        payload
      });
      expect(upload.statusCode).toBe(201);

      const after = await prisma.location.findUniqueOrThrow({ where: { id: fixture.locationA.id } });
      expect(after.logoAssetId).not.toBeNull();
      expect(after.logoAssetId).not.toBe(firstAssetId);

      // The first row is still there, byte-for-byte, not overwritten in place.
      const firstAsset = await prisma.locationAsset.findUniqueOrThrow({ where: { id: firstAssetId! } });
      expect(Buffer.compare(firstAsset.data, ONE_PIXEL_PNG)).toBe(0);

      const publicLogo = await app.inject({
        method: "GET",
        url: `/api/public/locations/${fixture.locationA.slug}/logo`
      });
      expect(Buffer.compare(publicLogo.rawPayload, secondPng)).toBe(0);
    });

    it("refuses an upload for another location", async () => {
      const { payload, contentTypeHeader } = buildMultipartBody(
        "logo",
        "logo.png",
        "image/png",
        ONE_PIXEL_PNG
      );
      const response = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationB.id}/logo`,
        headers: { cookie: ownerA, "content-type": contentTypeHeader },
        payload
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
