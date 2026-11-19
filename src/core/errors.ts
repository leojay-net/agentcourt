export class CourtError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CourtError';
  }
}

export class InvalidTermsError extends CourtError {
  public constructor(message: string) {
    super(`Invalid escrow terms: ${message}`);
    this.name = 'InvalidTermsError';
  }
}

export class EscrowNotFundedError extends CourtError {
  public constructor(contractAddress: string) {
    super(`No funded escrow output found at ${contractAddress}`);
    this.name = 'EscrowNotFundedError';
  }
}

export class InsufficientFundsError extends CourtError {
  public constructor(address: string, requiredSatoshis: bigint, availableSatoshis: bigint) {
    super(
      `Address ${address} holds ${availableSatoshis} satoshis but ${requiredSatoshis} are required`,
    );
    this.name = 'InsufficientFundsError';
  }
}

export class DeliverableTooLargeError extends CourtError {
  public constructor(sizeInBytes: number, limitInBytes: number) {
    super(`Deliverable is ${sizeInBytes} bytes; the limit is ${limitInBytes} bytes`);
    this.name = 'DeliverableTooLargeError';
  }
}

export class JuryQuorumError extends CourtError {
  public constructor(message: string) {
    super(`Jury quorum not reached: ${message}`);
    this.name = 'JuryQuorumError';
  }
}
