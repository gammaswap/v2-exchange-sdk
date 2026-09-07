import "dotenv/config";
import { createInfoClient } from "@gammaswap/v2-exchange-sdk";

const API_URL = process.env.API_URL || "http://localhost:3000";
const ACCOUNT_LIST = parseRequiredList("ACCOUNT_LIST");
const ASSET_ID_LIST = parseRequiredList("ASSET_ID_LIST");
const EPOCH = process.env.EPOCH?.trim() || undefined;

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function parseRequiredList(name: string): string[] {
  const values = requireEnvironment(name)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value`);
  }

  return values;
}

async function main(): Promise<void> {
  const client = createInfoClient({ apiUrl: API_URL });
  let totalBalance = 0n;
  let totalMargin = 0n;
  let totalPosBalance = 0n;
  let totalPending = 0n;
  const balances: unknown[] = [];
  const positions: unknown[] = [];

  console.log("\n===========Balances==============\n");
  const balanceResponses = await Promise.all(
    ACCOUNT_LIST.map(async (account) => ({ account, response: await client.getBalance(account) })),
  );
  for (const { account, response } of balanceResponses) {
    console.log(
      `Account: ${account}, Balance: ${response.data.balance.toString()}, pending: ${response.data.pending.toString()}`,
    );
    totalBalance += response.data.balance;
    totalPending += response.data.pending;
    balances.push(response.data);
  }

  const assetEpochs = new Map(
    await Promise.all(
      ASSET_ID_LIST.map(async (assetId) => {
        const response = await client.getAsset(assetId);
        return [assetId, response.data.epoch.toString()] as const;
      }),
    ),
  );

  const positionResponses = await Promise.all(
    ACCOUNT_LIST.flatMap((account) =>
      ASSET_ID_LIST.map(async (assetId) => {
        const epoch = EPOCH ?? assetEpochs.get(assetId);
        if (!epoch) {
          throw new Error(`No current epoch found for asset ${assetId}`);
        }
        const response = await client.getPosition({ account, assetId, epoch });
        return { account, assetId, epoch, response };
      }),
    ),
  );

  console.log("\n===========Positions==============\n");
  for (const { account, assetId, epoch, response } of positionResponses) {
    console.log(
      `Account: ${account}, Margin: ${response.data.margin.toString()}, balance: ${response.data.balance.toString()}, assetId: ${assetId}, epoch: ${epoch}`,
    );
    totalMargin += response.data.margin;
    totalPosBalance += response.data.balance;
    positions.push(response.data);
  }

  console.log("\n==================================\n");
  console.log(`API URL: ${API_URL}`);
  console.log(`Epoch: ${EPOCH ?? "current epoch per asset"}`);
  console.log(`Accounts: ${ACCOUNT_LIST.length}`);
  console.log(`Assets: ${ASSET_ID_LIST.length}`);
  console.log(`Total balance: ${totalBalance.toString()}`);
  console.log(`Total pending: ${totalPending.toString()}`);
  console.log(`Total margin: ${totalMargin.toString()}`);
  console.log(`Total pos balance: ${totalPosBalance.toString()}`);
  console.log(`Total: ${(totalMargin + totalBalance).toString()}`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
