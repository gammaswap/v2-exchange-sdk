import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeAssetId,
  encodeAssetId,
  getExpirationTf,
  parseExpirationTf,
} from "@gammaswap/v2-exchange-sdk/assetIdUtils";

test("asset ID encoding and decoding preserve packed fields", () => {
  const input = {
    id: "18446744073709551615",
    marketType: 255,
    startTime: 4_294_967_295,
    periodLength: 4_294_967_295,
    strike: "281474976710655",
    range: 65_535,
    reserved: "72057594037927935",
  };

  const decoded = decodeAssetId(
    encodeAssetId(
      input.id,
      input.marketType,
      input.startTime,
      input.periodLength,
      input.strike,
      input.range,
      input.reserved,
    ),
  );

  assert.deepEqual(decoded, {
    ...input,
    id: input.id,
    expiration: input.startTime + input.periodLength,
  });
});

test("asset ID encoding rejects values outside their packed widths", () => {
  assert.throws(() => encodeAssetId("18446744073709551616", 0, 0, 0, "0", 0));
  assert.throws(() => encodeAssetId("0", 256, 0, 0, "0", 0));
  assert.throws(() => encodeAssetId("0", 0, 0, 0, "281474976710656", 0));
  assert.throws(() => encodeAssetId("0", 0, 0, 0, "0", 65_536));
});

test("expiration timeframe helpers convert supported units", () => {
  assert.equal(getExpirationTf(900), "15m");
  assert.equal(parseExpirationTf("15m"), 900);
  assert.equal(parseExpirationTf("1H"), 3600);
  assert.equal(parseExpirationTf("2M"), 5_184_000);
  assert.throws(() => parseExpirationTf("0m"));
  assert.throws(() => parseExpirationTf("15x"));
});
