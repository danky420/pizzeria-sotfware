import type { FastifyInstance } from "fastify";
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
}
