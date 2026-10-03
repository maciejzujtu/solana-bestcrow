import { CrowdfundingProxy } from "@/services/CrowdfundingProxy";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return new CrowdfundingProxy().forward((await context.params).path, request);
}

export async function POST(request: Request, context: Context) {
  return new CrowdfundingProxy().forward((await context.params).path, request);
}
