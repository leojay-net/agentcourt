import { Network } from 'cashscript';

export const DEFAULT_NETWORK = Network.CHIPNET;

export const CHIPNET_EXPLORER_TRANSACTION_URL = 'https://chipnet.imaginary.cash/tx/';
export const CHIPNET_EXPLORER_ADDRESS_URL = 'https://chipnet.imaginary.cash/address/';

/** Must equal MAXIMUM_MINER_FEE_SATOSHIS in contracts/AgentCourt.cash. */
export const CONTRACT_MAXIMUM_MINER_FEE_SATOSHIS = 2000n;

/** Fee paid by every transaction that spends an escrow. Well under the contract cap. */
export const ESCROW_SPEND_FEE_SATOSHIS = 1200n;

/** Relay fee floor on BCH, in satoshis per byte. */
export const MINIMUM_RELAY_FEE_RATE = 1;

/** Largest deliverable, in bytes, that fits inside the fixed spend fee at the relay floor. */
export const MAXIMUM_DELIVERABLE_BYTES = 600;

/** Smallest escrow worth creating: covers the spend fee and leaves the payee a non-dust output. */
export const MINIMUM_ESCROW_SATOSHIS = 3000n;

export const REQUIRED_JUROR_COUNT = 3;
export const JUROR_QUORUM = 2;

export const PRIVATE_KEY_BYTE_LENGTH = 32;
