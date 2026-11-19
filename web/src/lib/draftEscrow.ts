import { CashAddressType, decodeCashAddress, sha256 } from '@bitauth/libauth';
import { instantiateCourtContract } from '../../../src/core/courtContract';
import { decodeHex, encodeUtf8 } from '../../../src/core/hex';
import {
  serializeEscrowTerms,
  validateEscrowTerms,
  type EscrowTerms,
  type SerializedEscrowTerms,
} from '../../../src/core/terms';
import { getChainProvider, readChainHeight } from './chain';

const COMPRESSED_PUBLIC_KEY_BYTE_LENGTH = 33;

export type AcceptanceMode = 'hash' | 'jury';

export interface DraftRequest {
  readonly clientAddress: string;
  readonly workerAddress: string;
  readonly jurorPublicKeysHex: readonly [string, string, string];
  readonly acceptanceMode: AcceptanceMode;
  readonly expectedDeliverable: string;
  readonly refundAfterBlocks: number;
}

export interface EscrowDraft {
  readonly contractAddress: string;
  readonly terms: SerializedEscrowTerms;
}

export class DraftValidationError extends Error {
  public constructor(
    public readonly fieldName: string,
    message: string,
  ) {
    super(message);
    this.name = 'DraftValidationError';
  }
}

function decodePublicKeyHash(address: string, fieldName: string): Uint8Array {
  const decodedAddress = decodeCashAddress(address.trim());
  if (typeof decodedAddress === 'string') {
    throw new DraftValidationError(fieldName, 'Enter a valid Bitcoin Cash address.');
  }
  const isPayToPublicKeyHash =
    decodedAddress.type === CashAddressType.p2pkh ||
    decodedAddress.type === CashAddressType.p2pkhWithTokens;
  if (!isPayToPublicKeyHash) {
    throw new DraftValidationError(fieldName, 'Use a standard single-key address, not a script address.');
  }
  return decodedAddress.payload;
}

function decodeJurorKey(publicKeyHex: string, jurorNumber: number): Uint8Array {
  const fieldName = `juror${jurorNumber}`;
  try {
    return decodeHex(publicKeyHex, COMPRESSED_PUBLIC_KEY_BYTE_LENGTH);
  } catch {
    throw new DraftValidationError(
      fieldName,
      'Enter a 33-byte compressed public key as 66 hexadecimal characters.',
    );
  }
}

function computeAcceptanceHash(request: DraftRequest): Uint8Array {
  if (request.acceptanceMode === 'jury') {
    return sha256.hash(crypto.getRandomValues(new Uint8Array(32)));
  }
  if (request.expectedDeliverable.length === 0) {
    throw new DraftValidationError('deliverable', 'Enter the exact result the worker must deliver.');
  }
  return sha256.hash(encodeUtf8(request.expectedDeliverable));
}

export async function draftEscrow(request: DraftRequest): Promise<EscrowDraft> {
  const clientPublicKeyHash = decodePublicKeyHash(request.clientAddress, 'client');
  const workerPublicKeyHash = decodePublicKeyHash(request.workerAddress, 'worker');
  const jurorPublicKeys: [Uint8Array, Uint8Array, Uint8Array] = [
    decodeJurorKey(request.jurorPublicKeysHex[0], 1),
    decodeJurorKey(request.jurorPublicKeysHex[1], 2),
    decodeJurorKey(request.jurorPublicKeysHex[2], 3),
  ];
  if (!Number.isInteger(request.refundAfterBlocks) || request.refundAfterBlocks < 1) {
    throw new DraftValidationError('refund', 'Enter a whole number of blocks, at least 1.');
  }

  const currentHeight = await readChainHeight();
  const terms: EscrowTerms = {
    clientPublicKeyHash,
    workerPublicKeyHash,
    jurorPublicKeys,
    acceptanceHash: computeAcceptanceHash(request),
    refundBlockHeight: currentHeight + request.refundAfterBlocks,
  };

  try {
    validateEscrowTerms(terms);
  } catch (validationFailure) {
    const message = validationFailure instanceof Error ? validationFailure.message : 'Invalid terms';
    throw new DraftValidationError('terms', message);
  }

  const contract = instantiateCourtContract(terms, getChainProvider());
  return { contractAddress: contract.address, terms: serializeEscrowTerms(terms) };
}
