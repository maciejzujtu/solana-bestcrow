import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RewardClaimDto, RewardOfferDto, RewardType } from './types.js';

export interface RewardOfferInput { campaign: string; title: string; type: RewardType; description: string | null; content: string | null; minAmount: string; quantity: number | null; }

export class RewardRepository {
  public constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS reward_offers (
      id TEXT PRIMARY KEY, campaign TEXT NOT NULL, title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('message','file','code','physical')),
      description TEXT, content TEXT, min_amount TEXT NOT NULL DEFAULT '0',
      quantity INTEGER, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_reward_offers_campaign ON reward_offers(campaign);
      CREATE TABLE IF NOT EXISTS reward_claims (
      id TEXT PRIMARY KEY, reward_id TEXT NOT NULL REFERENCES reward_offers(id),
      wallet TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','fulfilled','cancelled')),
      delivery TEXT, delivered_content TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(reward_id, wallet));
      CREATE INDEX IF NOT EXISTS idx_reward_claims_wallet ON reward_claims(wallet);`);
  }

  public createOffer(input: RewardOfferInput, now: number): RewardOfferDto {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO reward_offers
      (id,campaign,title,type,description,content,min_amount,quantity,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, input.campaign, input.title, input.type, input.description, input.content, input.minAmount, input.quantity, now);
    return this.getOffer(id)!;
  }
  public getOffer(id: string): RewardOfferDto | null {
    const row = this.db.prepare(`SELECT o.*, COUNT(CASE WHEN c.status != 'cancelled' THEN 1 END) AS claimed_count
      FROM reward_offers o LEFT JOIN reward_claims c ON c.reward_id=o.id WHERE o.id=? GROUP BY o.id`).get(id) as any;
    return row ? { id: row.id, campaign: row.campaign, title: row.title, type: row.type,
      description: row.description, content: row.content, minAmount: row.min_amount,
      quantity: row.quantity === null ? null : Number(row.quantity), claimedCount: Number(row.claimed_count), createdAt: row.created_at } : null;
  }
  public listOffers(campaign: string): RewardOfferDto[] {
    const rows = this.db.prepare(`SELECT id FROM reward_offers WHERE campaign=? ORDER BY created_at,id`).all(campaign) as { id: string }[];
    // Never expose codes, keys or private message/file content on the public route.
    return rows.map((row) => { const offer = this.getOffer(row.id); return offer ? { ...offer, content: null } : null; }).filter((offer): offer is RewardOfferDto => offer !== null);
  }
  public createClaim(rewardId: string, wallet: string, delivery: unknown, now: number, content: string | null): RewardClaimDto {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO reward_claims (id,reward_id,wallet,status,delivery,delivered_content,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, rewardId, wallet, content === null ? 'pending' : 'fulfilled', JSON.stringify(delivery ?? null), content, now, now);
    return this.getClaim(id)!;
  }
  public getClaim(id: string): RewardClaimDto | null {
    const row = this.db.prepare(`SELECT c.*,o.campaign FROM reward_claims c JOIN reward_offers o ON o.id=c.reward_id WHERE c.id=?`).get(id) as any;
    return row ? { id: row.id, rewardId: row.reward_id, campaign: row.campaign, wallet: row.wallet,
      status: row.status, delivery: row.delivery ? JSON.parse(row.delivery) : null,
      deliveredContent: row.delivered_content, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }
  public findClaim(rewardId: string, wallet: string): RewardClaimDto | null {
    const row = this.db.prepare('SELECT id FROM reward_claims WHERE reward_id=? AND wallet=?').get(rewardId, wallet) as { id: string } | undefined;
    return row ? this.getClaim(row.id) : null;
  }
  public countClaims(rewardId: string): number { return Number((this.db.prepare("SELECT COUNT(*) AS n FROM reward_claims WHERE reward_id=? AND status!='cancelled'").get(rewardId) as any)?.n ?? 0); }
  public listClaimsForWallet(wallets: string[]): RewardClaimDto[] {
    if (!wallets.length) return [];
    const q = wallets.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT id FROM reward_claims WHERE wallet IN (${q}) ORDER BY created_at DESC`).all(...wallets) as { id: string }[];
    return rows.map((row) => this.getClaim(row.id)!).filter(Boolean);
  }
}
