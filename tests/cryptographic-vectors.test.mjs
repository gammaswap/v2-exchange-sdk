import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import {
  hashAgentApprovalJS,
  hashApproveAgentOrderJS,
  hashCancelOrderEntryJS,
  hashCancelOrderJS,
  hashCancelReplaceOrderJS,
  hashClaimOrderEntryJS,
  hashClaimOrderJS,
  hashDepositOrderEntryJS,
  hashDepositOrderJS,
  hashFillOrderEntryJS,
  hashFillOrderJS,
  hashInvalidateOrderJS,
  hashOnchainDepositOrderEntryJS,
  hashOnchainDepositOrderJS,
  hashPauseOrderEntryJS,
  hashPauseOrderJS,
  hashResolutionOrderEntry,
  hashResolutionOrderJS,
  hashRevokeAgentOrderJS,
  hashWithdrawalOrderEntryJS,
  hashWithdrawalOrderJS,
  getExchangeDomain,
  hashTypedDataStruct,
} from "@gammaswap/v2-exchange-sdk/hashing";
import { signOrderJS, validateSignatureJS } from "@gammaswap/v2-exchange-sdk/signing";

const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const wallet = new Wallet(PRIVATE_KEY);
const DOMAIN = getExchangeDomain("31337", "0x0000000000000000000000000000000000000007");
const AGENT = "0x0000000000000000000000000000000000000003";
const TOKEN = "0x0000000000000000000000000000000000000004";
const LEDGER = "0x0000000000000000000000000000000000000005";
const RECEIVER = "0x0000000000000000000000000000000000000006";
const HASH_22 = `0x${"22".repeat(32)}`;
const HASH_33 = `0x${"33".repeat(32)}`;
const SIGNATURE_44 = `0x${"44".repeat(65)}`;
const ENTRY_SIGNATURE = `0x${"55".repeat(65)}`;

const auth = {
  typ: 2n,
  nonce: 1n,
  signer: wallet.address,
  signatureType: 0n,
  sender: wallet.address,
};

const actions = {
  fill: {
    ...auth,
    epoch: 2n,
    side: false,
    assetId: 123n,
    size: 1000000n,
    price: 500000n,
    timeInForce: 0n,
    approvalNonce: 7n,
  },
  cancel: {
    ...auth,
    typ: 3n,
    assetId: 123n,
    epoch: 2n,
    orderHash: HASH_22,
    approvalNonce: 7n,
  },
  cancelReplace: {
    ...auth,
    typ: 63n,
    assetId: 123n,
    epoch: 2n,
    cancelOrderHash: HASH_22,
    replacementOrderHash: HASH_33,
    approvalNonce: 7n,
    allOrNothing: true,
  },
  claim: { ...auth, typ: 5n, assetId: 123n, epoch: 2n, approvalNonce: 7n },
  deposit: {
    ...auth,
    typ: 0n,
    amount: 1000000n,
    token: TOKEN,
    ledger: LEDGER,
    permitNonce: 8n,
    permitSignature: SIGNATURE_44,
  },
  withdrawal: { ...auth, typ: 1n, receiver: RECEIVER, amount: 1000000n, ledger: LEDGER },
  approveAgent: {
    ...auth,
    typ: 61n,
    agent: AGENT,
    approvalNonce: 7n,
    approvalSignature: SIGNATURE_44,
  },
  revokeAgent: { ...auth, typ: 62n },
  resolution: { ...auth, typ: 4n, assetId: 123n, epoch: 2n, price: 500000n },
  pause: { ...auth, typ: 6n, isPause: true },
  invalidate: { ...auth, typ: 60n, id: 9n },
  onchainDeposit: {
    typ: 7n,
    id: 10n,
    arrivalTime: 1700000000n,
    owner: wallet.address,
    amount: 1000000n,
    index: 11n,
    ledger: LEDGER,
  },
  agentApproval: {
    master: wallet.address,
    agent: AGENT,
    approvalNonce: 7n,
    approvalSignature: SIGNATURE_44,
  },
};

const entryAuth = { ...auth, signature: ENTRY_SIGNATURE };
const entries = {
  pause: { auth: { ...entryAuth, typ: 6n }, arrivalTime: 1700000001n, isPause: true },
  onchainDeposit: actions.onchainDeposit,
  deposit: {
    auth: { ...entryAuth, typ: 0n },
    arrivalTime: 1700000001n,
    id: 12n,
    amount: 1000000n,
    token: TOKEN,
    ledger: LEDGER,
    permitNonce: 8n,
    permitSignature: SIGNATURE_44,
  },
  withdrawal: {
    auth: { ...entryAuth, typ: 1n },
    arrivalTime: 1700000001n,
    id: 13n,
    receiver: RECEIVER,
    amount: 1000000n,
    ledger: LEDGER,
  },
  fill: {
    auth: { ...entryAuth, typ: 2n },
    arrivalTime: 1700000001n,
    side: false,
    epoch: 2n,
    id: 14n,
    assetId: 123n,
    price: 500000n,
    size: 1000000n,
    maxSize: 1000000n,
    fillPrice: 500000n,
    fill: 1000000n,
    fillId: 15n,
    accountFee: 1n,
    exchangeFee: 2n,
    accountFeeSide: false,
    timeInForce: 0n,
    approvalNonce: 7n,
    approvalSignature: SIGNATURE_44,
  },
  cancel: {
    auth: { ...entryAuth, typ: 3n },
    arrivalTime: 1700000001n,
    id: 16n,
    assetId: 123n,
    epoch: 2n,
    orderHash: HASH_22,
    approvalNonce: 7n,
    approvalSignature: SIGNATURE_44,
  },
  claim: {
    auth: { ...entryAuth, typ: 5n },
    arrivalTime: 1700000001n,
    id: 17n,
    assetId: 123n,
    epoch: 2n,
    approvalNonce: 7n,
    approvalSignature: SIGNATURE_44,
  },
  resolution: {
    auth: { ...entryAuth, typ: 4n },
    arrivalTime: 1700000001n,
    id: 18n,
    assetId: 123n,
    epoch: 2n,
    price: 500000n,
  },
};

const vectors = {
  fill: {
    hash: "0x069f86cad0d2400f1321bd0be210cac88c445beb88b7f8e5771ce35a739a4927",
    signature:
      "0xb437788cd25c0a1f2e0bc974f170ca6b68f90d67b4ce82f055d69d3edcf48c0c6a5afecbbff424ddb537bd637a0fbede2de96d0a39b8b41acc6c96abde2d56b91b",
    fn: hashFillOrderJS,
    action: actions.fill,
  },
  cancel: {
    hash: "0xa94bdcd9bce4bdce897026ac3ae4fa0dc4a6731e37535c2cd32c685173a12cc4",
    signature:
      "0x04ee62ccbeddd4d769b00f22cf9a9ba4ae0391e21fdffac01405a3ab9a69cc0c49db452d9bb514db3e2302b5b7c9890f7e52431c41935dee80c6a53635c50e2c1c",
    fn: hashCancelOrderJS,
    action: actions.cancel,
  },
  cancelReplace: {
    hash: "0x60b2213c2d583453d1246060342f4edfd950dc49ab134de7a6e9faa052b996db",
    signature:
      "0x9bd291b42dcf1eeef3dafbe7799501a1e07c175660f3c9fc5d6a7728f066fcae123785bd6ed71e9fdf3fffd815e1a2cdc9b79e0553fdf86478c5ae98a59a8cb71c",
    fn: hashCancelReplaceOrderJS,
    action: actions.cancelReplace,
  },
  claim: {
    hash: "0xdfc029be48334e8afb35bb7e242fd2738d7620ede96f8ff0c22ab408f9a93723",
    signature:
      "0x84c4077a71cf599e1fce477c0bdbbb0a7dc20515d18f889dc485634baddd5ecf1c61e87994a5d66fa71dcb1bc0ad830d7910a30ab71aeded70a10cad82812deb1b",
    fn: hashClaimOrderJS,
    action: actions.claim,
  },
  deposit: {
    hash: "0x42a2b713613d3e5b1d0aae3203726416e7036402252371f8f0696ca447f987f8",
    signature:
      "0x6c8ed7db9989736c6582dab2de69ba7b9c0412fa6735d2560d175fffcddc4405162bc0c3a807ff93d7f3596dfcfc8e48a7c0c1c8c7c902569bec355f2560d3d01b",
    fn: hashDepositOrderJS,
    action: actions.deposit,
  },
  withdrawal: {
    hash: "0x16dddcaa46abfd7e8c6ea6ff1e0e815eec026d2ca5e791abc6492f55bb60f1ad",
    signature:
      "0x88fde27fc0290506320634d017bf259e409323b7964239c6f0aee75bc740f6b5428b1f3538e8f6bac084199df4c25b6ebc1de757e0877c2bd09aafb5a44214d31c",
    fn: hashWithdrawalOrderJS,
    action: actions.withdrawal,
  },
  approveAgent: {
    hash: "0xd032f706a2eb5f20060cd3d22d8ca734d997d25c34b4214ce5564cd659f395e8",
    signature:
      "0x56618be0a35e468b0b9fadebd860ff580611c37b48838f1e07b9ec7e9344eea4097603a0bd0b834fce90c32654cfdf40cbe7404d68b797019c09a35f866c9f171b",
    fn: hashApproveAgentOrderJS,
    action: actions.approveAgent,
  },
  revokeAgent: {
    hash: "0xa167332f60679275ec9510093973234adbdc6e238012fe2e5a58f54acb9e5b09",
    signature:
      "0x66a60b3829557258c7eda31ce275b2d9bf998794a3850caa0116fde0e160999d0af96b8d3451bd38fb23da2386ef02bfda688731a4b35af0dbdd1f90e61ae0491b",
    fn: hashRevokeAgentOrderJS,
    action: actions.revokeAgent,
  },
  resolution: {
    hash: "0x8bb6d5762bd6f0c6025e7d332a112a13fee1e14ddc6850f24bb8d07c449e7fe7",
    signature:
      "0x8649de71675f4db3bb26ad567ebd555284292dcf63685ffbf5c1b0a43bb7458243b2dabfcf3da1bd1b24cbb12721712122dbb0770ffa99bf88ae954190eb31ac1c",
    fn: hashResolutionOrderJS,
    action: actions.resolution,
  },
  pause: {
    hash: "0x5164c6d3313472200c575a7239e76b1c51dbc6c1f3a56473814da06a8ed302da",
    signature:
      "0x84aebb060dc2e08e954723229fb022f975323b210c1c000adbfa7f01ab9f4be011219927ef54e9e1fa05e7fae90cdebb4e2a4e3b7e235eab4027295d6ec586791b",
    fn: hashPauseOrderJS,
    action: actions.pause,
  },
  invalidate: {
    hash: "0x9e5fcd3378a16413d1508f023924e1397f59624ba43055ff4a3fe06acfbeae99",
    signature:
      "0xe2b1a6b20d1398855ad1c65eb7157db1efca4fc7dbe156b23737afc524e72cfd5d3242230756c49834759aced1dcd62d29133fa495029fb8e1060e1a09ff9ed41c",
    fn: hashInvalidateOrderJS,
    action: actions.invalidate,
  },
  onchainDeposit: {
    hash: "0xe1310930573e755d49f3720283c27b99e51f931f69ee6f9ba674e8023dd87a45",
    signature:
      "0xaa50acaed5c8e97dca8aa18aec594f4d6dbfb7599de93bc707609cb2772ae37e2848966d2a9ac5093db0509cb0b3fd5ad7d655441823f332590d99c3cd2f17601c",
    fn: hashOnchainDepositOrderJS,
    action: actions.onchainDeposit,
  },
  agentApproval: {
    hash: "0x77085253acaf05abe2e44a2c0edfb07a1f63edda9df7e5802d6f0b42c07da724",
    signature:
      "0xacc640fe7f9a0f94bf0c47518c316c8b0e0d5d2435fab3d08b37e4187d1736f93ef4c8528936a1487abc425f70cf7a79e1373ba8e89b600eb8a1b20dbe4ec28d1c",
    fn: hashAgentApprovalJS,
    action: actions.agentApproval,
  },
};

const entryVectors = [
  ["pause", hashPauseOrderEntryJS, entries.pause, vectors.pause.hash],
  [
    "on-chain deposit",
    hashOnchainDepositOrderEntryJS,
    entries.onchainDeposit,
    vectors.onchainDeposit.hash,
  ],
  ["deposit", hashDepositOrderEntryJS, entries.deposit, vectors.deposit.hash],
  ["withdrawal", hashWithdrawalOrderEntryJS, entries.withdrawal, vectors.withdrawal.hash],
  ["fill", hashFillOrderEntryJS, entries.fill, vectors.fill.hash],
  ["cancel", hashCancelOrderEntryJS, entries.cancel, vectors.cancel.hash],
  ["claim", hashClaimOrderEntryJS, entries.claim, vectors.claim.hash],
  ["resolution", hashResolutionOrderEntry, entries.resolution, vectors.resolution.hash],
];

test("all public action hash helpers match fixed cryptographic vectors", () => {
  for (const [name, vector] of Object.entries(vectors)) {
    assert.equal(vector.fn(vector.action, DOMAIN), vector.hash, name);
  }
});

test("the generic EIP-712 digest helper matches a fixed vector", () => {
  assert.equal(
    hashTypedDataStruct(`0x${"66".repeat(32)}`, DOMAIN),
    "0xe1741724b2d8063c34ea5ae681c59e93610a3000f77af295ae40500faef49c72",
  );
});

test("all public entry hash helpers match fixed cryptographic vectors", () => {
  for (const [name, fn, entry, expected] of entryVectors) {
    assert.equal(fn(entry, DOMAIN), expected, name);
  }
});

test("signing and signature recovery match fixed cryptographic vectors", () => {
  for (const [name, vector] of Object.entries(vectors)) {
    const signature = signOrderJS(vector.hash, wallet);
    assert.equal(signature, vector.signature, name);
    assert.equal(validateSignatureJS(vector.hash, signature, wallet.address), true, name);
  }
});
