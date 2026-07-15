import assert from "node:assert/strict";
import test from "node:test";

test("package root and public subpath exports can be imported", async () => {
  const modules = await Promise.all([
    import("@my-company/exchange-sdk"),
    import("@my-company/exchange-sdk/builders"),
    import("@my-company/exchange-sdk/client"),
    import("@my-company/exchange-sdk/constants"),
    import("@my-company/exchange-sdk/errors"),
    import("@my-company/exchange-sdk/hashing"),
    import("@my-company/exchange-sdk/schemas"),
    import("@my-company/exchange-sdk/signing"),
    import("@my-company/exchange-sdk/types"),
    import("@my-company/exchange-sdk/utils"),
    import("@my-company/exchange-sdk/websocket"),
  ]);

  for (const module of modules) {
    assert.equal(typeof module, "object");
  }
});
