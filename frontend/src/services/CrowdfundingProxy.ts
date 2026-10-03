import { FrontendConfig } from "@/config/FrontendConfig";

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PREPARE_ACTIONS = new Set(["pledge", "withdraw", "evidence", "vote"]);

export class CrowdfundingProxy {
  private readonly config = FrontendConfig.fromEnv();

  async forward(parts: string[], request: Request): Promise<Response> {
    const method = request.method;
    const address = parts[0];
    const create = method === "POST" && parts.length === 1 && address === "prepare";
    const read = method === "GET" && parts.length === 1 && ADDRESS.test(address);
    const action = method === "GET" && parts.length === 2 && ADDRESS.test(address) && parts[1] === "action";
    const refund = method === "GET" && parts.length === 2 && ADDRESS.test(address) && parts[1] === "refund";
    const prepare = method === "POST" && parts.length === 3 && ADDRESS.test(address)
      && PREPARE_ACTIONS.has(parts[1]) && parts[2] === "prepare";
    if (!create && !read && !action && !refund && !prepare) {
      return Response.json({ error: "Unsupported campaign route" }, { status: 404 });
    }
    const endpoint = new URL("/campaigns/" + parts.join("/"), this.config.backendUrl);
    if (action || refund) endpoint.search = new URL(request.url).search;
    try {
      const response = await fetch(endpoint, {
        method,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        body: method === "POST" ? await request.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(this.config.backendTimeoutMs, 10_000)),
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch {
      return Response.json({ error: "Backend is unavailable" }, { status: 502 });
    }
  }
}
