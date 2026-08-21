import "dotenv/config";
import { createInfoClient, HttpResponseError } from "@gammaswap/v2-exchange-sdk";

const API_URL = process.env.API_URL || "http://localhost:3000";

// run with "pnpm sample:health"
async function main() {
  const client = createInfoClient({ apiUrl: API_URL });

  try {
    const res = await client.getHealth();
    console.log("Server response:", res.status, res.data);
  } catch (err: unknown) {
    if (err instanceof HttpResponseError) {
      console.error("Error response:", err.status, err.data);
    } else if (err instanceof Error) {
      console.error("Request error:", err.message);
    } else {
      console.error("Request error:", err);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
