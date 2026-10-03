import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { BackendConfig } from "./config.js";
import type { SolanaGateway } from "./chain.js";
import type { KeeperService } from "./keeper.js";
import type { KeeperDispatcher } from "./dispatch.js";
import type { CreateRequest, CrowdfundingService } from "./crowdfunding.js";

export class ApiServer {
  private server: Server | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly config: BackendConfig,
    private readonly chain: SolanaGateway,
    private readonly keeper: KeeperService,
    private readonly crowdfunding: CrowdfundingService,
    private readonly dispatcher: KeeperDispatcher | null,
  ) {}

  private async readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > this.config.maxBodyBytes) throw new Error("Request body too large");
      chunks.push(bytes);
    }
    if (length === 0) throw new Error("Request body is missing");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        this.send(res, 200, { status: "ok", rpcUrl: this.config.rpcUrl });
        return;
      }
      if (req.method === "GET" && url.pathname === "/campaigns") {
        this.send(res, 200, await this.chain.listCampaigns());
        return;
      }
      if (req.method === "GET" && url.pathname === "/keeper/actions") {
        this.send(res, 200, await this.keeper.scanActions());
        return;
      }
      if (req.method === "POST" && url.pathname === "/campaigns/prepare") {
        this.send(res, 200, this.crowdfunding.prepareCreate(await this.readBody(req) as CreateRequest));
        return;
      }
      const prepareMatch = /^\/campaigns\/([^/]+)\/(pledge|withdraw|evidence|vote)\/prepare$/.exec(url.pathname);
      if (req.method === "POST" && prepareMatch) {
        this.chain.publicKey(prepareMatch[1]);
        const campaign = await this.chain.getCampaign(prepareMatch[1]);
        if (!campaign) return this.send(res, 404, { error: "Campaign not found" });
        const input = await this.readBody(req) as Record<string, unknown>;
        const action = prepareMatch[2];
        if (action === "pledge") this.send(res, 200, this.crowdfunding.preparePledge(campaign, input.wallet as string, input.amount as string));
        if (action === "withdraw") this.send(res, 200, this.crowdfunding.prepareWithdraw(campaign, input.wallet as string, input.amount as string));
        if (action === "evidence") this.send(res, 200, this.crowdfunding.prepareEvidence(campaign, input.creator as string, input.evidenceHash as string));
        if (action === "vote") {
          if (typeof input.approve !== "boolean") return this.send(res, 400, { error: "approve must be boolean" });
          this.send(res, 200, await this.crowdfunding.prepareVote(campaign, input.wallet as string, input.approve));
        }
        return;
      }
      const refundMatch = /^\/campaigns\/([^/]+)\/refund$/.exec(url.pathname);
      if (req.method === "GET" && refundMatch) {
        const campaign = await this.chain.getCampaign(refundMatch[1]);
        if (!campaign) return this.send(res, 404, { error: "Campaign not found" });
        const wallet = url.searchParams.get("wallet");
        const caller = url.searchParams.get("caller") ?? wallet;
        if (!wallet || !caller) return this.send(res, 400, { error: "wallet and caller are required" });
        this.send(res, 200, await this.keeper.refundInstruction(campaign, wallet, caller));
        return;
      }
      const match = /^\/campaigns\/([^/]+)(?:\/(action))?$/.exec(url.pathname);
      if (req.method === "GET" && match) {
        this.chain.publicKey(match[1]);
        const campaign = await this.chain.getCampaign(match[1]);
        if (!campaign) return this.send(res, 404, { error: "Campaign not found" });
        if (!match[2]) return this.send(res, 200, campaign);
        const action = await this.keeper.campaignAction(campaign);
        if (!action) return this.send(res, 200, { action: null });
        const caller = url.searchParams.get("caller");
        this.send(res, 200, caller ? await this.keeper.unsignedAction(campaign, action, caller) : action);
        return;
      }
      this.send(res, 404, { error: "Route not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const badInput = error instanceof SyntaxError || /invalid|missing|wrong|positive|large|unknown|not open|not active|unsupported|outside|exceed|requires|must|ended|unavailable/i.test(message);
      console.error("API error", message);
      this.send(res, badInput ? 400 : 502, { error: message });
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const actions = await this.keeper.scanActions();
      for (const action of actions) console.log("Keeper action available", action);
      if (this.dispatcher) await this.dispatcher.dispatch(actions);
    } catch (error) {
      console.error("Keeper poll failed", error);
    } finally {
      this.polling = false;
    }
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.config.port, this.config.host, resolve);
    });
    this.server = server;
    console.log(`Bestcrow v2 backend listening on ${this.config.host}:${this.config.port}`);
    if (this.config.pollMs > 0) {
      void this.poll();
      this.pollTimer = setInterval(() => void this.poll(), this.config.pollMs);
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
