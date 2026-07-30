import assert from "node:assert/strict";
import test from "node:test";

test("package root and public subpath exports can be imported", async () => {
  const modules = await Promise.all([
    import("@gammaswap/v2-exchange-sdk"),
    import("@gammaswap/v2-exchange-sdk/builders"),
    import("@gammaswap/v2-exchange-sdk/client"),
    import("@gammaswap/v2-exchange-sdk/config"),
    import("@gammaswap/v2-exchange-sdk/constants"),
    import("@gammaswap/v2-exchange-sdk/decimal-inputs"),
    import("@gammaswap/v2-exchange-sdk/deposit-client"),
    import("@gammaswap/v2-exchange-sdk/errors"),
    import("@gammaswap/v2-exchange-sdk/hashing"),
    import("@gammaswap/v2-exchange-sdk/oracle-websocket"),
    import("@gammaswap/v2-exchange-sdk/schemas"),
    import("@gammaswap/v2-exchange-sdk/signing"),
    import("@gammaswap/v2-exchange-sdk/types"),
    import("@gammaswap/v2-exchange-sdk/utils"),
    import("@gammaswap/v2-exchange-sdk/websocket"),
  ]);

  for (const module of modules) {
    assert.equal(typeof module, "object");
  }

  const websocketModule = modules.at(-1);
  assert.equal(typeof websocketModule.createExchangeWebSocketClient, "function");

  const oracleWebsocketModule = modules.at(9);
  assert.equal(typeof oracleWebsocketModule.createOracleWebSocketClient, "function");
});
