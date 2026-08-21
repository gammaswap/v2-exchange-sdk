import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validationDirectory = mkdtempSync(join(tmpdir(), "v2-exchange-sdk-package-"));
const runPackageManager = (command, args, options) =>
  execFileSync("/bin/sh", ["-c", 'exec "$0" "$@"', command, ...args], options);
const runNode = (args, options) => runPackageManager("node", args, options);

try {
  const pnpmPackHelp = runPackageManager("pnpm", ["pack", "--help"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const dryRunCommand = pnpmPackHelp.includes("--dry-run")
    ? ["pnpm", ["pack", "--dry-run"]]
    : ["npm", ["pack", "--dry-run"]];

  runPackageManager(dryRunCommand[0], dryRunCommand[1], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });

  runPackageManager("pnpm", ["pack", "--pack-destination", validationDirectory], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });

  const tarballs = readdirSync(validationDirectory).filter((file) => file.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "expected exactly one packed SDK tarball");

  const tarballPath = join(validationDirectory, tarballs[0]);
  writeFileSync(
    join(validationDirectory, "package.json"),
    JSON.stringify(
      {
        name: "v2-exchange-sdk-package-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@gammaswap/v2-exchange-sdk": `file:${tarballPath}`,
        },
      },
      null,
      2,
    ),
  );

  runPackageManager("pnpm", ["install", "--ignore-workspace", "--no-frozen-lockfile"], {
    cwd: validationDirectory,
    stdio: "inherit",
  });

  const importSmokeTest = join(validationDirectory, "import-smoke-test.mjs");
  writeFileSync(
    importSmokeTest,
    `import assert from "node:assert/strict";

const root = await import("@gammaswap/v2-exchange-sdk");
const subpaths = [
  "assetIdUtils",
  "builders",
  "client",
  "config",
  "constants",
  "decimal-inputs",
  "deposit-client",
  "errors",
  "hashing",
  "integer-inputs",
  "string-inputs",
  "oracle-websocket",
  "schemas",
  "signing",
  "types",
  "utils",
  "websocket",
];

for (const subpath of subpaths) {
  const module = await import("@gammaswap/v2-exchange-sdk/" + subpath);
  assert.equal(typeof module, "object");
}

assert.equal(typeof root.createInfoClient, "function");
assert.equal(typeof root.decodeAssetId, "function");
assert.equal(typeof root.hashFillOrderJS, "function");
assert.equal(typeof root.HttpTransportError, "function");
`,
  );

  runNode([importSmokeTest], {
    cwd: validationDirectory,
    stdio: "inherit",
  });

  console.log("Packed package imports validated successfully.");
} finally {
  rmSync(validationDirectory, { recursive: true, force: true });
}
