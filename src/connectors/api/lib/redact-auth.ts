export function redactAuth(auth: unknown): unknown {
  if (!auth || typeof auth !== "object") return auth;
  const a = auth as { type?: string };
  switch (a.type) {
    case "bearer":
      return { type: "bearer", token: "***" };
    case "api_key_header": {
      const o = a as { headerName?: string };
      return { type: "api_key_header", headerName: o.headerName, value: "***" };
    }
    case "basic": {
      const o = a as { username?: string };
      return { type: "basic", username: o.username, password: "***" };
    }
    default:
      return auth;
  }
}
