// nonce-manager.ts

const COUNTER_BITS = 16n;
const MAX_COUNTER = (1n << COUNTER_BITS) - 1n;
const MAX_TIMESTAMP = (1n << 48n) - 1n;
const MAX_UINT64 = (1n << 64n) - 1n;

export interface NonceManagerOptions {
  /**
   * Primarily useful for tests or restoring known state.
   */
  initialTimestampMs?: bigint;

  /**
   * Primarily useful for tests.
   */
  now?: () => number;
}

/**
 * Generates monotonically increasing uint64 nonces.
 *
 * Layout:
 *
 * [ 48-bit timestamp in milliseconds ][ 16-bit counter ]
 *
 * Guarantees uniqueness within this NonceManager instance.
 *
 * It does not guarantee uniqueness across independent processes or devices
 * using the same account unless those processes coordinate nonce allocation.
 */
export class NonceManager {
  private lastTimestampMs: bigint;
  private counter = 0n;
  private readonly now: () => number;

  public constructor(options: NonceManagerOptions = {}) {
    this.now = options.now ?? Date.now;

    const initialTimestamp = options.initialTimestampMs ?? BigInt(this.now());

    this.assertTimestampFits(initialTimestamp);
    this.lastTimestampMs = initialTimestamp;
  }

  /**
   * Returns the next unique nonce as a bigint suitable for a Solidity uint64.
   */
  public next(): bigint {
    const currentTimestampMs = BigInt(this.now());
    this.assertTimestampFits(currentTimestampMs);

    if (currentTimestampMs > this.lastTimestampMs) {
      this.lastTimestampMs = currentTimestampMs;
      this.counter = 0n;
    } else {
      /*
       * The clock either stayed within the same millisecond or moved backward.
       * Continue using the last logical timestamp and increment the counter.
       */
      this.counter += 1n;

      if (this.counter > MAX_COUNTER) {
        /*
         * More than 65,536 nonces were generated without the physical clock
         * advancing. Advance the logical timestamp by one millisecond.
         */
        this.lastTimestampMs += 1n;
        this.counter = 0n;

        this.assertTimestampFits(this.lastTimestampMs);
      }
    }

    const nonce = (this.lastTimestampMs << COUNTER_BITS) | this.counter;

    if (nonce > MAX_UINT64) {
      throw new RangeError("Generated nonce exceeds uint64");
    }

    return nonce;
  }

  /**
   * Returns the next nonce as a decimal string for JSON transport.
   *
   * JSON.stringify does not support bigint directly, so this is usually the
   * appropriate representation for API requests.
   */
  public nextString(): string {
    return this.next().toString();
  }

  /**
   * Extracts the timestamp portion of a generated nonce.
   */
  public static getTimestampMs(nonce: bigint): bigint {
    NonceManager.assertUint64(nonce);
    return nonce >> COUNTER_BITS;
  }

  /**
   * Extracts the counter portion of a generated nonce.
   */
  public static getCounter(nonce: bigint): number {
    NonceManager.assertUint64(nonce);
    return Number(nonce & MAX_COUNTER);
  }

  private assertTimestampFits(timestampMs: bigint): void {
    if (timestampMs < 0n || timestampMs > MAX_TIMESTAMP) {
      throw new RangeError(`Timestamp must fit within 48 bits: ${timestampMs}`);
    }
  }

  private static assertUint64(value: bigint): void {
    if (value < 0n || value > MAX_UINT64) {
      throw new RangeError(`Value is not a uint64: ${value}`);
    }
  }
}
