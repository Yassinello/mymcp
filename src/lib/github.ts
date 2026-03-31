const GITHUB_API = "https://api.github.com";
const FETCH_TIMEOUT = 10_000; // 10 seconds

function getConfig() {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  if (!pat || !repo) {
    throw new Error("Missing GITHUB_PAT or GITHUB_REPO env vars");
  }
  return { pat, repo };
}

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

// --- Types ---

interface GitHubContentResponse {
  path: string;
  name: string;
  sha: string;
  size: number;
  content: string;
  encoding: string;
  type: string;
}

interface GitHubDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
}

interface GitHubSearchResponse {
  total_count: number;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    text_matches?: Array<{ fragment: string }>;
  }>;
}

interface GitHubRepoResponse {
  id: number;
  full_name: string;
  private: boolean;
}

export interface VaultFile {
  path: string;
  name: string;
  sha: string;
  content: string;
  size: number;
}

export interface VaultListEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

export interface SearchResult {
  name: string;
  path: string;
  textMatches: string[];
}

// --- Path validation ---

export function validateVaultPath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new Error("Path cannot be empty");
  }
  if (path.includes("..")) {
    throw new Error("Path cannot contain '..' (directory traversal)");
  }
  if (path.startsWith("/")) {
    throw new Error("Path must be relative (no leading /)");
  }
  if (/\0/.test(path)) {
    throw new Error("Path cannot contain null bytes");
  }
}

// --- Fetch with timeout ---

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// --- Read ---

export async function vaultRead(path: string): Promise<VaultFile> {
  validateVaultPath(path);
  const { pat, repo } = getConfig();
  const res = await fetchWithTimeout(
    `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(path)}`,
    { headers: headers(pat) }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Note not found: ${path}`);
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data = (await res.json()) as GitHubContentResponse;
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return { path: data.path, name: data.name, sha: data.sha, content, size: data.size };
}

// --- Write (create or update) ---

export async function vaultWrite(
  path: string,
  content: string,
  message?: string,
  knownSha?: string
): Promise<{ path: string; sha: string; created: boolean }> {
  validateVaultPath(path);
  const { pat, repo } = getConfig();
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(path)}`;

  // Use known SHA if provided, otherwise fetch
  let existingSha = knownSha;
  if (!existingSha) {
    const getRes = await fetchWithTimeout(url, { headers: headers(pat) });
    if (getRes.ok) {
      const existing = (await getRes.json()) as GitHubContentResponse;
      existingSha = existing.sha;
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub API error: ${getRes.status}`);
    }
  }

  const body: Record<string, string> = {
    message: message || "Update via YassMCP",
    content: Buffer.from(content, "utf-8").toString("base64"),
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const putRes = await fetchWithTimeout(url, {
    method: "PUT",
    headers: headers(pat),
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub PUT error: ${putRes.status} — ${err}`);
  }

  const result = await putRes.json();
  return {
    path: result.content.path,
    sha: result.content.sha,
    created: !existingSha,
  };
}

// --- Delete ---

export async function vaultDelete(
  path: string,
  message?: string,
  knownSha?: string
): Promise<{ path: string }> {
  validateVaultPath(path);
  const { pat, repo } = getConfig();
  const url = `${GITHUB_API}/repos/${repo}/contents/${encodeURIPath(path)}`;

  // Use known SHA if provided, otherwise fetch
  let sha = knownSha;
  if (!sha) {
    const getRes = await fetchWithTimeout(url, { headers: headers(pat) });
    if (!getRes.ok) {
      if (getRes.status === 404) throw new Error(`Note not found: ${path}`);
      throw new Error(`GitHub API error: ${getRes.status}`);
    }
    const existing = (await getRes.json()) as GitHubContentResponse;
    sha = existing.sha;
  }

  const delRes = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: headers(pat),
    body: JSON.stringify({
      message: message || `Delete ${path} via YassMCP`,
      sha,
    }),
  });

  if (!delRes.ok) {
    const err = await delRes.text();
    throw new Error(`GitHub DELETE error: ${delRes.status} — ${err}`);
  }

  return { path };
}

// --- List directory ---

export async function vaultList(folder?: string): Promise<VaultListEntry[]> {
  if (folder) validateVaultPath(folder);
  const { pat, repo } = getConfig();
  const pathSegment = folder ? `/${encodeURIPath(folder)}` : "";
  const res = await fetchWithTimeout(
    `${GITHUB_API}/repos/${repo}/contents${pathSegment}`,
    { headers: headers(pat) }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Folder not found: ${folder || "/"}`);
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data = (await res.json()) as GitHubDirectoryEntry[];
  if (!Array.isArray(data)) {
    throw new Error(`Path is a file, not a directory: ${folder}`);
  }

  return data.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type === "dir" ? "dir" as const : "file" as const,
    size: item.size || 0,
  }));
}

// --- Search ---

export async function vaultSearch(
  query: string,
  folder?: string,
  limit = 10,
  page = 1
): Promise<{ results: SearchResult[]; totalCount: number }> {
  if (folder) validateVaultPath(folder);
  const { pat, repo } = getConfig();

  let q = `${query} repo:${repo}`;
  if (folder) {
    q += ` path:${folder}`;
  }

  const res = await fetchWithTimeout(
    `${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=${limit}&page=${page}`,
    {
      headers: {
        ...headers(pat),
        Accept: "application/vnd.github.text-match+json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub Search error: ${res.status}`);
  }

  const data = (await res.json()) as GitHubSearchResponse;

  return {
    totalCount: data.total_count,
    results: (data.items || []).map((item) => ({
      name: item.name,
      path: item.path,
      textMatches: (item.text_matches || []).map((m) => m.fragment),
    })),
  };
}

// --- Health check ---

export async function checkVaultHealth(): Promise<{
  ok: boolean;
  patValid: boolean;
  repoAccessible: boolean;
  rateLimit: { remaining: number; limit: number; reset: string };
  error?: string;
}> {
  const { pat, repo } = getConfig();

  const res = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}`, {
    headers: headers(pat),
  });

  const rateLimitRemaining = parseInt(res.headers.get("x-ratelimit-remaining") || "0");
  const rateLimitTotal = parseInt(res.headers.get("x-ratelimit-limit") || "0");
  const rateLimitReset = new Date(
    parseInt(res.headers.get("x-ratelimit-reset") || "0") * 1000
  ).toISOString();

  const rateLimit = { remaining: rateLimitRemaining, limit: rateLimitTotal, reset: rateLimitReset };

  if (!res.ok) {
    return {
      ok: false,
      patValid: res.status !== 401,
      repoAccessible: false,
      rateLimit,
      error: `${res.status}`,
    };
  }

  return { ok: true, patValid: true, repoAccessible: true, rateLimit };
}

// --- Helpers ---

function encodeURIPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
