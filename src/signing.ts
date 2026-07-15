import { recoverAddress, Signature, Wallet } from "ethers";

export function signOrderJS(orderHash: string, wallet: Wallet) : string {
    const sigObj = wallet.signingKey.sign(orderHash);
    // sigObj: { r: string, s: string, v: number }

    // Pack r || s || v exactly like abi.encodePacked(r, s, v)
    return Signature.from(sigObj).serialized;
}

export function validateSignatureJS(digest: string, signature: string, expectedSigner: string): boolean {
    // recover signer from raw digest + 65-byte signature
    const recovered = recoverAddress(digest, signature);
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
}