import 'dotenv/config';
import axios from "axios";

const ASSET_ENDPOINT = process.env.BALANCE_ENDPOINT || "http://localhost:3000/asset";
const ASSET_ID_TYPE2 = process.env.ASSET_ID_TYPE2 || "87112285931778509194580910505449742997580152833"

// run with "npx ts-node ./src/getAsset.ts"
async function main() {

    let asset = "261336857817713630688382311349658711122006440411137"; // asset1
    const args = process.argv.slice(2);
    if (args.length > 0) {
        asset = args[0]; // custom asset
        if(asset == "2") {
            asset = ASSET_ID_TYPE2; // asset2
        }
    }

    try {
        const res = await axios.get(ASSET_ENDPOINT + `/${asset}`);
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
