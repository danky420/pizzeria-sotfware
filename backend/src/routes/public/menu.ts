import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { presentLocation, presentMenuTree } from "../../lib/present.js";
import { loadPublicLocation } from "../../lib/scope.js";
import { slugParams } from "../../schemas/index.js";
import { loadMenuTree } from "../../services/menu.js";

export default async function publicMenuRoutes(app: FastifyInstance): Promise<void> {
  app.get("/locations/:slug", async (request) => {
    const { slug } = slugParams.parse(request.params);
    const location = await loadPublicLocation(slug);
    return { location: presentLocation(location) };
  });

  app.get("/locations/:slug/menu", async (request) => {
    const { slug } = slugParams.parse(request.params);
    const location = await loadPublicLocation(slug);
    const categories = await loadMenuTree(location.id);

    return {
      location: presentLocation(location),
      categories: presentMenuTree(categories, { includeHidden: false })
    };
  });

  // The logo is already publicly visible on the storefront, so this needs no
  // auth. A new upload always creates a new LocationAsset row rather than
  // mutating one in place (see admin/locations.ts), which is what makes this
  // immutable cache header safe: a given id's bytes never change.
  app.get("/locations/:slug/logo", async (request, reply) => {
    const { slug } = slugParams.parse(request.params);
    const location = await loadPublicLocation(slug);
    if (!location.logoAssetId) throw notFound("This location has no logo set");

    const asset = await prisma.locationAsset.findUnique({ where: { id: location.logoAssetId } });
    if (!asset) throw notFound("This location has no logo set");

    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return reply.type(asset.mimeType).send(asset.data);
  });
}
