import 'dotenv/config';
import { Wallet } from "ethers";
import axios from "axios";
import { deriveAccountsFromMnemonic } from "../utils.js";

const CHAIN_ID = process.env.CHAIN_ID || "31337";
const LEDGER_ADDRESS = process.env.LEDGER_CONTRACT || "0x0000000000000000000000000000000000000000";
const SETTLEMENT_TOKEN_ADDRESS = process.env.SETTLEMENT_TOKEN || "0x0000000000000000000000000000000000000000";
const MNEMONIC = process.env.TEST_MNEMONIC || "test test test test test test test test test test test junk";
const ORDERBOOK_ENDPOINT = process.env.ORDERBOOK_ENDPOINT || "http://localhost:3000/book";
const ASSET_ID = process.env.ASSET_ID || "261336857817713630688382311349658711122006440411137";
const EPOCH = process.env.EPOCH || "0";

// run with "npx ts-node ./src/getBook.ts"
async function main() {
    console.log("CHAIN_ID:", CHAIN_ID);
    console.log("LEDGER_ADDRESS:", LEDGER_ADDRESS);
    console.log("SETTLEMENT_TOKEN_ADDRESS:", SETTLEMENT_TOKEN_ADDRESS);
    const account = deriveAccountsFromMnemonic(MNEMONIC, 1)[0];
    console.log("Using address:", account.address);

    const wallet = new Wallet(account.privateKey);
    console.log("wallet:", wallet.address);

    try {
        const res = await axios.get(ORDERBOOK_ENDPOINT + `/market/top/${ASSET_ID}/${EPOCH}`);
        console.log("Server response:", res.status, res.data);
    } catch (err: any) {
        if (err.response) {
            console.error(
                "Error response:",
                err.response.status,
                err.response.data
            );
        } else {
            console.error("Request error:", err.message);
        }
    }
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
