import assert from "node:assert/strict";
import test from "node:test";
import { NonceManager } from "@gammaswap/v2-exchange-sdk";

test("NonceManager generates increasing nonces", () => {
  let now = 1_700_000_000_000;

  const manager = new NonceManager({
    now: () => now,
  });

  const first = manager.next();
  const second = manager.next();
  const third = manager.next();

  assert.ok(second > first);
  assert.ok(third > second);
});

test("NonceManager resets the counter when time advances", () => {
  let now = 1_700_000_000_000;

  const manager = new NonceManager({
    now: () => now,
  });

  manager.next();
  manager.next();

  now += 1;

  const nonce = manager.next();

  assert.ok(NonceManager.getTimestampMs(nonce) === BigInt(now));
  assert.ok(NonceManager.getCounter(nonce) === 0);
});

test("NonceManager remains monotonic when the clock moves backward", () => {
  let now = 1_700_000_000_000;

  const manager = new NonceManager({
    now: () => now,
  });

  const first = manager.next();

  now -= 10_000;

  const second = manager.next();

  assert.ok(second > first);
  assert.equal(NonceManager.getTimestampMs(second), NonceManager.getTimestampMs(first));
});

test("NonceManager returns JSON-safe decimal strings", () => {
  const manager = new NonceManager({
    now: () => 1_700_000_000_000,
  });

  assert.ok(manager.nextString().match(/^\d+$/));
});
