import 'dotenv/config';
import { ethers } from "ethers";
import axios from "axios";
import { deriveAccountsFromMnemonic } from "../utils.js";

const CHAIN_ID = process.env.CHAIN_ID || "31337";
const MNEMONIC = process.env.TEST_MNEMONIC || "test test test test test test test test test test test junk";
const AGENT_STATUS_ENDPOINT = process.env.AGENT_STATUS_ENDPOINT || "http://localhost:3000/agents/status";
const WALLET_INDEX = Number(process.env.WALLET_INDEX || "0")

// run with "npx ts-node ./src/getBook.ts"
async function main() {
    console.log("CHAIN_ID:", CHAIN_ID);
    const account = deriveAccountsFromMnemonic(MNEMONIC, WALLET_INDEX + 1)[WALLET_INDEX];

    let _account = account.address;
    if (process.argv.length > 2) {
        if(!ethers.isAddress(process.argv[2])) {
            console.log("Invalid epoch provided")
            return
        }
        _account = process.argv[2]
    }
    console.log("Using address:", _account);

    try {
        const res = await axios.get(AGENT_STATUS_ENDPOINT + `/${_account}`);
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
