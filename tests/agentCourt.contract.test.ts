import { TransactionBuilder, randomToken, randomUtxo } from 'cashscript';
import { beforeEach, describe, expect, it } from 'vitest';
import { ESCROW_SPEND_FEE_SATOSHIS } from '../src/core/constants';
import {
  executeJuryRuling,
  findEscrowUtxo,
  refundEscrow,
  settleEscrow,
} from '../src/core/escrow';
import { encodeUtf8 } from '../src/core/hex';
import {
  ACCEPTED_DELIVERABLE,
  ESCROW_SATOSHIS,
  REFUND_BLOCK_HEIGHT,
  createCourtFixture,
  depositEscrow,
  type CourtFixture,
} from './courtFixture';

let fixture: CourtFixture;

beforeEach(function prepareFreshEscrow() {
  fixture = createCourtFixture();
  depositEscrow(fixture);
});

describe('settle: programmatic acceptance', function describeSettle() {
  it('pays the worker when the deliverable matches the committed hash', async function () {
    const receipt = await settleEscrow({
      provider: fixture.provider,
      contract: fixture.contract,
      worker: fixture.worker,
      deliverable: ACCEPTED_DELIVERABLE,
    });

    expect(receipt.transactionId).toHaveLength(64);
    const workerUtxos = await fixture.provider.getUtxos(fixture.worker.address);
    expect(workerUtxos).toHaveLength(1);
    expect(workerUtxos[0]?.satoshis).toBe(ESCROW_SATOSHIS - ESCROW_SPEND_FEE_SATOSHIS);
  });

  it('rejects a deliverable that does not match the committed hash', async function () {
    await expect(
      settleEscrow({
        provider: fixture.provider,
        contract: fixture.contract,
        worker: fixture.worker,
        deliverable: encodeUtf8('[1,2,3,5,8,14]'),
      }),
    ).rejects.toThrow();
  });

  it('rejects a settlement signed by anyone other than the worker', async function () {
    const escrowUtxo = await findEscrowUtxo(fixture.contract);
    const impostorSettlement = new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.bystander.publicKey,
          fixture.bystander.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({
        to: fixture.worker.address,
        amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
      });

    await expect(impostorSettlement.send()).rejects.toThrow();
  });

  it('rejects a settlement that redirects the funds to another address', async function () {
    const escrowUtxo = await findEscrowUtxo(fixture.contract);
    const redirectedSettlement = new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.worker.publicKey,
          fixture.worker.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({
        to: fixture.bystander.address,
        amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
      });

    await expect(redirectedSettlement.send()).rejects.toThrow();
  });

  it('rejects a settlement that skims the escrow through an inflated miner fee', async function () {
    const escrowUtxo = await findEscrowUtxo(fixture.contract);
    const inflatedFee = 5_000n;
    const skimmingSettlement = new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.worker.publicKey,
          fixture.worker.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({ to: fixture.worker.address, amount: escrowUtxo.satoshis - inflatedFee });

    await expect(skimmingSettlement.send()).rejects.toThrow();
  });

  it('rejects a settlement that adds a second output', async function () {
    const escrowUtxo = await findEscrowUtxo(fixture.contract);
    const splitSettlement = new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.worker.publicKey,
          fixture.worker.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({ to: fixture.worker.address, amount: 10_000n })
      .addOutput({ to: fixture.bystander.address, amount: 8_800n });

    await expect(splitSettlement.send()).rejects.toThrow();
  });
});

describe('refund: timeout', function describeRefund() {
  it('rejects a refund before the deadline', async function () {
    await expect(
      refundEscrow({
        provider: fixture.provider,
        contract: fixture.contract,
        client: fixture.client,
        refundBlockHeight: REFUND_BLOCK_HEIGHT,
      }),
    ).rejects.toThrow();
  });

  it('refunds the client once the deadline block height is reached', async function () {
    fixture.provider.setBlockHeight(REFUND_BLOCK_HEIGHT + 1);

    await refundEscrow({
      provider: fixture.provider,
      contract: fixture.contract,
      client: fixture.client,
      refundBlockHeight: REFUND_BLOCK_HEIGHT,
    });

    const clientUtxos = await fixture.provider.getUtxos(fixture.client.address);
    expect(clientUtxos[0]?.satoshis).toBe(ESCROW_SATOSHIS - ESCROW_SPEND_FEE_SATOSHIS);
  });

  it('rejects a refund claimed by someone other than the client', async function () {
    fixture.provider.setBlockHeight(REFUND_BLOCK_HEIGHT + 1);
    const escrowUtxo = await findEscrowUtxo(fixture.contract);
    const impostorRefund = new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.refund(
          fixture.bystander.publicKey,
          fixture.bystander.signatureTemplate,
        ),
        { sequence: 0xfffffffe },
      )
      .addOutput({
        to: fixture.bystander.address,
        amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
      })
      .setLocktime(REFUND_BLOCK_HEIGHT);

    await expect(impostorRefund.send()).rejects.toThrow();
  });
});

describe('rule: jury ruling', function describeRule() {
  it('pays the worker when two jurors sign', async function () {
    await executeJuryRuling({
      provider: fixture.provider,
      contract: fixture.contract,
      beneficiaryAddress: fixture.worker.address,
      firstJuror: fixture.jurors[0],
      secondJuror: fixture.jurors[2],
    });

    const workerUtxos = await fixture.provider.getUtxos(fixture.worker.address);
    expect(workerUtxos[0]?.satoshis).toBe(ESCROW_SATOSHIS - ESCROW_SPEND_FEE_SATOSHIS);
  });

  it('refunds the client when two jurors sign for the client', async function () {
    await executeJuryRuling({
      provider: fixture.provider,
      contract: fixture.contract,
      beneficiaryAddress: fixture.client.address,
      firstJuror: fixture.jurors[0],
      secondJuror: fixture.jurors[1],
    });

    const clientUtxos = await fixture.provider.getUtxos(fixture.client.address);
    expect(clientUtxos[0]?.satoshis).toBe(ESCROW_SATOSHIS - ESCROW_SPEND_FEE_SATOSHIS);
  });

  it('rejects a ruling signed by one juror and one outsider', async function () {
    await expect(
      executeJuryRuling({
        provider: fixture.provider,
        contract: fixture.contract,
        beneficiaryAddress: fixture.worker.address,
        firstJuror: fixture.jurors[0],
        secondJuror: fixture.bystander,
      }),
    ).rejects.toThrow();
  });

  it('rejects a ruling where the same juror signs twice', async function () {
    await expect(
      executeJuryRuling({
        provider: fixture.provider,
        contract: fixture.contract,
        beneficiaryAddress: fixture.worker.address,
        firstJuror: fixture.jurors[1],
        secondJuror: fixture.jurors[1],
      }),
    ).rejects.toThrow();
  });

  it('rejects a ruling that pays an address that is neither party', async function () {
    await expect(
      executeJuryRuling({
        provider: fixture.provider,
        contract: fixture.contract,
        beneficiaryAddress: fixture.bystander.address,
        firstJuror: fixture.jurors[0],
        secondJuror: fixture.jurors[1],
      }),
    ).rejects.toThrow();
  });
});

describe('CashToken escrow', function describeTokenEscrow() {
  async function depositTokenEscrow() {
    const token = randomToken({ amount: 750n });
    fixture.provider.addUtxo(
      fixture.contract.address,
      randomUtxo({ satoshis: ESCROW_SATOSHIS, token }),
    );
    return token;
  }

  it('carries a fungible token balance through settlement unchanged', async function () {
    fixture.provider.reset();
    const token = await depositTokenEscrow();
    const escrowUtxo = await findEscrowUtxo(fixture.contract);

    await new TransactionBuilder({ provider: fixture.provider })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.worker.publicKey,
          fixture.worker.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({
        to: fixture.worker.tokenAddress,
        amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
        token,
      })
      .send();

    const workerUtxos = await fixture.provider.getUtxos(fixture.worker.address);
    expect(workerUtxos[0]?.token?.amount).toBe(750n);
  });

  it('rejects a settlement that burns part of the token balance', async function () {
    fixture.provider.reset();
    const token = await depositTokenEscrow();
    const escrowUtxo = await findEscrowUtxo(fixture.contract);

    const burningSettlement = new TransactionBuilder({
      provider: fixture.provider,
      allowImplicitFungibleTokenBurn: true,
    })
      .addInput(
        escrowUtxo,
        fixture.contract.unlock.settle(
          fixture.worker.publicKey,
          fixture.worker.signatureTemplate,
          ACCEPTED_DELIVERABLE,
        ),
      )
      .addOutput({
        to: fixture.worker.tokenAddress,
        amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
        token: { ...token, amount: 700n },
      });

    await expect(burningSettlement.send()).rejects.toThrow();
  });
});

describe('contract identity', function describeIdentity() {
  it('derives a testnet-form address that depends on the terms', function () {
    const secondFixture = createCourtFixture();
    expect(secondFixture.contract.address).not.toBe(fixture.contract.address);
    expect(fixture.contract.address.startsWith('bchtest:')).toBe(true);
  });
});

