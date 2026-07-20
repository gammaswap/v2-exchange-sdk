import { ChainId } from "./constants.js";
import { getExchangeConfigRequestSchema, parseExchangeChainConfig } from "./schemas.js";
import type { ExchangeChainConfig, ExchangeContracts, ProtocolBigNumberish } from "./types.js";
import { ZeroAddress } from "ethers";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export const BASE_EXCHANGE_CHAIN_CONFIG = parseExchangeChainConfig({
  chainId: ChainId.BASE,
  contracts: {
    exchange: ZeroAddress,
    ledger: ZeroAddress,
    settlementToken: ZeroAddress,
    permit2: PERMIT2_ADDRESS,
  },
});

export const BASE_SEPOLIA_EXCHANGE_CHAIN_CONFIG = parseExchangeChainConfig({
  chainId: ChainId.BASE_SEPOLIA,
  contracts: {
    exchange: "0x756C91877892068383292Dd66b347640db5fE426",
    ledger: "0xfB55E27Bb4c3E29cD253CbC74B0552FDa8Bc6189",
    settlementToken: "0xdf3d36447b22e9feEe337765DdC413d09fA03bC2",
    permit2: PERMIT2_ADDRESS,
  },
});

export const LOCALHOST_EXCHANGE_CHAIN_CONFIG = parseExchangeChainConfig({
  chainId: ChainId.LOCALHOST,
  contracts: {
    exchange: "0x749d20D85555330d20862770b58a72939285c42a",
    ledger: "0xC7975277e79BD36eb18bD490d097a6857e130e48",
    depositLedger: "0xCF9C83be89ac927F9D98F0CaFB9ED7fDea2fD459",
    settlementToken: "0x10Aeafac83d48E2f9ac4bAAf94311c45fACe1404",
    permit2: "0xCABEe62adFB2a4d4172Fc2F7536f324FC52C274a",
  },
});

const defaultExchangeChainConfigs = new Map<bigint, ExchangeChainConfig>(
  [BASE_EXCHANGE_CHAIN_CONFIG, BASE_SEPOLIA_EXCHANGE_CHAIN_CONFIG, LOCALHOST_EXCHANGE_CHAIN_CONFIG].map((config) => [
    config.chainId,
    config,
  ]),
);

export function getDefaultExchangeChainConfig(
  chainId: ProtocolBigNumberish,
): ExchangeChainConfig | undefined {
  const parsedChainId = getExchangeConfigRequestSchema.parse({ chainId }).chainId;
  const config = defaultExchangeChainConfigs.get(parsedChainId);
  return config === undefined ? undefined : cloneExchangeChainConfig(config);
}

export function getDefaultExchangeContracts(
  chainId: ProtocolBigNumberish,
): ExchangeContracts | undefined {
  return getDefaultExchangeChainConfig(chainId)?.contracts;
}

function cloneExchangeChainConfig(config: ExchangeChainConfig): ExchangeChainConfig {
  return {
    chainId: config.chainId,
    contracts: {
      ...config.contracts,
    },
  };
}
