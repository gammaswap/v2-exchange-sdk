import { HDNodeWallet } from "ethers";

// Derive a few accounts: index 0,1,2 on path m/44'/60'/0'/0/i
export function deriveAccountsFromMnemonic(
    mnemonic: string,
    count: number
): { index: number; address: string; privateKey: string }[] {
    const accounts: { index: number; address: string; privateKey: string }[] = [];

    for (let i = 0; i < count; i++) {
        // For ethers v6, Wallet.fromPhrase supports an optional derivation path argument
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = HDNodeWallet.fromPhrase(mnemonic,"", path);
        accounts.push({
            index: i,
            address: wallet.address,
            privateKey: wallet.privateKey,
        });
    }

    return accounts;
}

export function getCurrentTime() : bigint {
    return BigInt(Math.floor(Date.now() / 1000));
}