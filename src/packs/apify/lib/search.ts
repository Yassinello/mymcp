import { apifyGet } from "./client";

export interface ActorSummary {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  url: string;
}

interface MyActorsResponse {
  data?: {
    items?: Array<{
      id?: string;
      name?: string;
      username?: string;
      title?: string;
      description?: string;
      isPublic?: boolean;
    }>;
  };
}

interface StoreResponse {
  data?: {
    items?: Array<{
      id?: string;
      name?: string;
      username?: string;
      title?: string;
      description?: string;
    }>;
  };
}

function actorUrl(username: string | undefined, name: string | undefined): string {
  if (username && name) return `https://apify.com/${username}/${name}`;
  return "https://apify.com/store";
}

/**
 * Merge results from the user's own actors + the public store.
 * Dedupe by actor id.
 */
export async function searchActors(query: string): Promise<ActorSummary[]> {
  const q = query.toLowerCase();
  const results = new Map<string, ActorSummary>();

  // 1) User's own actors — filter client-side by substring match on name/title
  try {
    const mine = await apifyGet<MyActorsResponse>("/acts?my=true&limit=100");
    const items = mine?.data?.items ?? [];
    for (const a of items) {
      const name = a.name ?? "";
      const title = a.title ?? "";
      const hay = `${name} ${title} ${a.description ?? ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      if (!a.id) continue;
      const actorId = a.username && a.name ? `${a.username}/${a.name}` : (a.id ?? "");
      results.set(a.id, {
        id: actorId,
        name: title || name,
        description: a.description ?? "",
        isPublic: Boolean(a.isPublic),
        url: actorUrl(a.username, a.name),
      });
    }
  } catch {
    // Non-fatal — still return store results.
  }

  // 2) Public store search
  try {
    const store = await apifyGet<StoreResponse>(
      `/store?search=${encodeURIComponent(query)}&limit=10`
    );
    const items = store?.data?.items ?? [];
    for (const a of items) {
      if (!a.id) continue;
      if (results.has(a.id)) continue;
      const actorId = a.username && a.name ? `${a.username}/${a.name}` : (a.id ?? "");
      results.set(a.id, {
        id: actorId,
        name: a.title || a.name || actorId,
        description: a.description ?? "",
        isPublic: true,
        url: actorUrl(a.username, a.name),
      });
    }
  } catch {
    // Non-fatal.
  }

  return Array.from(results.values());
}
