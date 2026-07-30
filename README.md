# @gammaswap/v2-exchange-sdk

TypeScript SDK for the GammaSwap v2 exchange.

## Requirements

- Node.js 20+
- pnpm 10+ for local development

## Install

```sh
npm install @gammaswap/v2-exchange-sdk
```

## Imports

```ts
import {
  createInfoClient,
  createExchangeClient,
  createDepositClient,
  createExchangeWebSocketClient,
} from "@gammaswap/v2-exchange-sdk";
```

Submodules are also exported:

```ts
import { createExchangeWebSocketClient } from "@gammaswap/v2-exchange-sdk/websocket";
import { TimeInForce } from "@gammaswap/v2-exchange-sdk/constants";
```

## Input Units

Protocol values are validated before requests are sent. Prices, sizes, amounts,
nonces, IDs, and balances are converted to `bigint` internally and serialized as
decimal strings at JSON boundaries.

Order and transfer inputs use human decimal strings:

- `size` and `amount` allow up to two decimal places.
- `price` allows one decimal place and is interpreted as cents. For example,
  `99.9` becomes `999000n` in protocol units.
- Invalid precision, zero amounts, out-of-range values, invalid nonces, and
  invalid hashes throw validation errors before the SDK sends a request.

## InfoClient

`InfoClient` is the read-only HTTP client for exchange API data.

```ts
const info = createInfoClient({
  apiUrl: "http://localhost:3000",
});
```

Constructor parameters:

- `apiUrl`: required base URL for the exchange API.
- `fetch`: optional replacement for `globalThis.fetch`, useful in tests or
  custom runtimes.
- `headers`: optional headers added to every request.

Available functions:

- `getAsset(inputOrAssetId)`
- `getBalance(inputOrAccount)`
- `getOrderBook(input)`
- `getBookOrders(input)`
- `getTopOfBook(input)`
- `getPosition(input)`
- `getAgentApproval(inputOrAccount)`
- `getAgentApprovalNonce(inputOrAccount)`
- `getExchangeConfig(inputOrChainId)`

Idiosyncrasies:

- This client does not sign messages and does not need a wallet.
- `apiUrl` is normalized with a trailing slash internally.
- `getExchangeConfig()` fetches configured contract addresses from the API, but
  the SDK also has hard-coded defaults for supported chain IDs.

## ExchangeClient

`ExchangeClient` signs exchange actions with an `ethers` wallet and posts the
signed payloads to the exchange API.

```ts
import { Wallet } from "ethers";

const exchange = createExchangeClient({
  apiUrl: "http://localhost:3000",
  wallet: new Wallet(process.env.PRIVATE_KEY!),
  chainId: "31337",
});
```

Constructor parameters:

- `apiUrl`: required base URL for the exchange API.
- `wallet`: required `ethers` `Wallet` used for signing.
- `chainId`: required chain ID. If default contracts exist for this chain, the
  SDK uses them automatically.
- `contracts`: optional contract address overrides. Provide this when the chain
  has no SDK default or when testing custom deployments.
- `fetch`: optional replacement for `globalThis.fetch`.
- `headers`: optional headers added to every HTTP request.
- `infoClient`: optional `InfoClient` instance. If omitted, the exchange client
  creates one using the same `apiUrl`, `fetch`, and `headers`.
- `nonceManager`: optional `NonceManager`. If omitted, a local nonce manager is
  used to fill missing action nonces.

Available functions:

- `placeOrder(input)`
- `placeAgentOrder(input)`
- `cancelOrder(input)`
- `cancelAll(input)`
- `cancelReplaceOrder(input)`
- `cancelAgentOrder(input)`
- `cancelAllAgent(input)`
- `cancelReplaceAgentOrder(input)`
- `claim(input)`
- `claimAgent(input)`
- `withdraw(input)`
- `approveAgent(input)`
- `revokeAgent(input)`
- `signAgentApproval(input)`

Idiosyncrasies:

- Signed actions are strongly typed and reject unknown input fields at compile
  time when object literals are passed directly.
- If `nonce` is omitted, the configured `NonceManager` generates one.
- If `timeInForce` is omitted for orders, the SDK uses `TimeInForce.GTC`.
- Agent order, cancel, cancel-replace, and claim calls fetch the approval nonce
  from `InfoClient` when `approvalNonce` is omitted.
- `approveAgent()` requires the agent address to be different from the master
  wallet address and requires an approval nonce within the allowed future window.
- `cancelReplaceOrder()` and `cancelReplaceAgentOrder()` do not support the
  zero-hash cancel-all behavior.
- `chainId` is always required. `contracts` are optional only when the SDK has
  default contracts for that chain.

## DepositClient

`DepositClient` sends on-chain transactions for deposit-related settlement token
flows.

```ts
import { Wallet } from "ethers";

const deposit = createDepositClient({
  rpcUrl: "http://127.0.0.1:8545",
  wallet: new Wallet(process.env.PRIVATE_KEY!),
  chainId: "31337",
});
```

Constructor parameters:

- `rpcUrl`: required JSON-RPC URL used to send transactions.
- `wallet`: required `ethers` `Wallet`; the client connects it to the RPC
  provider.
- `chainId`: required chain ID. The RPC network must match this value.
- `depositLedger`: optional deposit ledger address override.
- `contracts`: optional contract address overrides. Used to resolve
  `depositLedger` if `depositLedger` is not provided.
- `settlementTokenDecimals`: optional, currently required to be `6`.

Available functions:

- `getSettlementToken()`
- `getPermit2()`
- `getAccountLedger()`
- `getPendingBalance()`
- `getProcessedBalance()`
- `getPendingDepositCount()`
- `getNextPendingDepositId()`
- `getProcessedDepositIndex()`
- `getMinBlockWait()`
- `canProcessNext()`
- `getSettlementTokenBalance(owner?)`
- `getSettlementTokenAllowance(spender?, owner?)`
- `approveDepositLedger(input)`
- `approvePermit2(input)`
- `deposit(input)`
- `signDepositPermit(input)`
- `depositWithPermit(input)`
- `parseAmount(amount)`

Idiosyncrasies:

- This client talks directly to the chain, not the HTTP exchange API.
- The client checks the RPC chain ID before contract reads and transactions.
- `depositLedger` can be passed explicitly or resolved from the default
  contracts for the configured chain.
- Settlement token, Permit2, and account ledger addresses are read from the
  deposit ledger contract.
- `deposit()` logs the deposit `txId` by default. Pass `logTxId: false` in the
  input to suppress that log.

## ExchangeWebSocketClient

`ExchangeWebSocketClient` subscribes to order book market-update streams by
`assetId`.

```ts
const ws = createExchangeWebSocketClient({
  websocketUrl: "ws://127.0.0.1:4000",
  onError: (error) => console.error(error),
});

const unsubscribe = await ws.subscribeOrderBook(
  "261336857817713630688382311349658711122006440411137",
  {
    onUpdate: (update) => console.log(update),
    onResyncRequired: (assetId) => {
      console.log("Reload full book from REST for", assetId);
    },
  },
);

await unsubscribe();
ws.close();
```

Constructor parameters:

- `websocketUrl`: required websocket endpoint URL.
- `WebSocketCtor`: optional websocket constructor. Defaults to
  `globalThis.WebSocket` when available, otherwise Node `ws`.
- `reconnect`: optional boolean, defaults to `true`.
- `reconnectDelayMs`: optional initial reconnect delay, defaults to `1000`.
- `maxReconnectDelayMs`: optional reconnect delay cap, defaults to `30000`.
- `ackTimeoutMs`: optional subscribe/unsubscribe acknowledgement timeout,
  defaults to `15000`.
- `onError`: optional global error callback.

Available functions and properties:

- `connectionState`
- `connect()`
- `close(code?, reason?)`
- `subscribeOrderBook(assetId, handlers)`
- `unsubscribeOrderBook(assetId)`

Subscription handlers:

- `onUpdate(update)`
- `onOrder(update)`
- `onTrade(update)`
- `onCancel(update)`
- `onResolution(update)`
- `onError(error)`
- `onResyncRequired(assetId)`

Idiosyncrasies:

- One client can subscribe to multiple asset IDs.
- Subscribing multiple handlers to the same asset ID sends one server
  subscription and fans updates out locally.
- The unsubscribe function returned by `subscribeOrderBook()` removes only that
  handler. If no handlers remain for the asset, the client sends an unsubscribe
  message to the server.
- `unsubscribeOrderBook(assetId)` removes all handlers for that asset.
- If the connection drops or the SDK decides the socket is unhealthy, active
  handlers receive `onResyncRequired(assetId)`. Consumers should reload the full
  book from REST before applying future stream updates.
- Unsubscribe acknowledgement failures are best-effort. The local subscription
  is removed, the error is emitted, and the client reconnects only if other
  active subscriptions remain.
- Browser WebSocket implementations only support `close()`. Node `ws` also has
  `terminate()`. The SDK accepts an optional `terminate()` on `WebSocketLike` and
  uses it when a socket is already considered unhealthy; otherwise it falls back
  to `close()`. Events from abandoned sockets are ignored so stale close/error
  events cannot affect a newer connection.

## Sample Scripts

Runnable examples live in `scripts/sample`. They import the SDK package, create
the relevant client, and make the API call or transaction directly in each file.

Common commands:

```sh
pnpm sample:asset
pnpm sample:book
pnpm sample:order
pnpm sample:cancel
pnpm sample:cancel-replace
pnpm sample:deposit
pnpm sample:withdrawal
pnpm sample:agent:order
pnpm sample:agent:cancel
pnpm sample:agent:cancel-replace
pnpm sample:agent:claim
pnpm sample:ws
```

The older direct API examples live in `scripts/api`.

## Development

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```
