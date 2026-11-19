import { sha256 } from '@bitauth/libauth';
import { REQUIRED_JUROR_COUNT } from './constants';
import { InvalidTermsError } from './errors';
import { decodeHex, encodeHex } from './hex';

const PUBLIC_KEY_HASH_BYTE_LENGTH = 20;
const COMPRESSED_PUBLIC_KEY_BYTE_LENGTH = 33;
const ACCEPTANCE_HASH_BYTE_LENGTH = 32;
const BLOCK_HEIGHT_UPPER_BOUND = 500_000_000;

/** Everything the covenant is parameterised by. Two identical terms always yield the same address. */
export interface EscrowTerms {
  readonly clientPublicKeyHash: Uint8Array;
  readonly workerPublicKeyHash: Uint8Array;
  readonly jurorPublicKeys: readonly [Uint8Array, Uint8Array, Uint8Array];
  readonly acceptanceHash: Uint8Array;
  /** Block height after which the client may reclaim the escrow. */
  readonly refundBlockHeight: number;
}

/** JSON-safe form of EscrowTerms, used in case files and by the web app. */
export interface SerializedEscrowTerms {
  readonly clientPublicKeyHashHex: string;
  readonly workerPublicKeyHashHex: string;
  readonly jurorPublicKeysHex: [string, string, string];
  readonly acceptanceHashHex: string;
  readonly refundBlockHeight: number;
}

export function computeAcceptanceHash(deliverable: Uint8Array): Uint8Array {
  return sha256.hash(deliverable);
}

export function validateEscrowTerms(terms: EscrowTerms): void {
  if (terms.clientPublicKeyHash.length !== PUBLIC_KEY_HASH_BYTE_LENGTH) {
    throw new InvalidTermsError('client public key hash must be 20 bytes');
  }
  if (terms.workerPublicKeyHash.length !== PUBLIC_KEY_HASH_BYTE_LENGTH) {
    throw new InvalidTermsError('worker public key hash must be 20 bytes');
  }
  if (terms.jurorPublicKeys.length !== REQUIRED_JUROR_COUNT) {
    throw new InvalidTermsError(`exactly ${REQUIRED_JUROR_COUNT} jurors are required`);
  }
  for (const [jurorIndex, jurorPublicKey] of terms.jurorPublicKeys.entries()) {
    if (jurorPublicKey.length !== COMPRESSED_PUBLIC_KEY_BYTE_LENGTH) {
      throw new InvalidTermsError(`juror ${jurorIndex + 1} key must be a 33-byte compressed key`);
    }
  }
  const distinctJurorKeys = new Set(terms.jurorPublicKeys.map(encodeHex));
  if (distinctJurorKeys.size !== REQUIRED_JUROR_COUNT) {
    throw new InvalidTermsError('jurors must be three distinct keys');
  }
  if (terms.acceptanceHash.length !== ACCEPTANCE_HASH_BYTE_LENGTH) {
    throw new InvalidTermsError('acceptance hash must be 32 bytes');
  }
  if (!Number.isInteger(terms.refundBlockHeight) || terms.refundBlockHeight <= 0) {
    throw new InvalidTermsError('refund block height must be a positive integer');
  }
  if (terms.refundBlockHeight >= BLOCK_HEIGHT_UPPER_BOUND) {
    throw new InvalidTermsError('refund time must be a block height, not a timestamp');
  }
  if (encodeHex(terms.clientPublicKeyHash) === encodeHex(terms.workerPublicKeyHash)) {
    throw new InvalidTermsError('client and worker must be different agents');
  }
}

export function serializeEscrowTerms(terms: EscrowTerms): SerializedEscrowTerms {
  return {
    clientPublicKeyHashHex: encodeHex(terms.clientPublicKeyHash),
    workerPublicKeyHashHex: encodeHex(terms.workerPublicKeyHash),
    jurorPublicKeysHex: [
      encodeHex(terms.jurorPublicKeys[0]),
      encodeHex(terms.jurorPublicKeys[1]),
      encodeHex(terms.jurorPublicKeys[2]),
    ],
    acceptanceHashHex: encodeHex(terms.acceptanceHash),
    refundBlockHeight: terms.refundBlockHeight,
  };
}

export function deserializeEscrowTerms(serialized: SerializedEscrowTerms): EscrowTerms {
  const terms: EscrowTerms = {
    clientPublicKeyHash: decodeHex(serialized.clientPublicKeyHashHex, PUBLIC_KEY_HASH_BYTE_LENGTH),
    workerPublicKeyHash: decodeHex(serialized.workerPublicKeyHashHex, PUBLIC_KEY_HASH_BYTE_LENGTH),
    jurorPublicKeys: [
      decodeHex(serialized.jurorPublicKeysHex[0], COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
      decodeHex(serialized.jurorPublicKeysHex[1], COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
      decodeHex(serialized.jurorPublicKeysHex[2], COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
    ],
    acceptanceHash: decodeHex(serialized.acceptanceHashHex, ACCEPTANCE_HASH_BYTE_LENGTH),
    refundBlockHeight: serialized.refundBlockHeight,
  };
  validateEscrowTerms(terms);
  return terms;
}
