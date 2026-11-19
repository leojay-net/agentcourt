# Architecture

## One covenant per task

`AgentCourt.cash` takes seven constructor arguments: client and worker public key hashes, three juror public keys, the acceptance hash, and the refund block height. Because the address commits to all of them, either party can rebuild it from the terms and no registry is needed.

## Why three exits

- Work with a single correct output is checked by the script. The client commits to `sha256(result)` when funding. The worker reveals `result` in the spend. No client approval exists, so a correct result cannot be held hostage.
- Work without a single correct output goes to the jury. For those tasks the client commits to a hash nobody can satisfy, which closes the `settle` path.
- Silence is handled by the timeout. The client needs nobody's cooperation.

## Fee and output pinning

Anything not sent to the payout output is a miner fee. Without a cap, a co-signer could skim the escrow through an inflated fee. `isFullPayoutTo` requires exactly one output, to the named recipient, worth at least the input minus 2,000 satoshis, with the token category, token amount and NFT commitment unchanged.

## Jury signatures

OP_CHECKMULTISIG on Bitcoin Cash accepts ECDSA signatures only, while single-signature checks default to Schnorr in CashScript. Jurors therefore sign with an ECDSA template (`multisigSignatureTemplate`). Signatures cover the transaction outputs, so a juror who signs a payout to the worker has voted for the worker.

## Mock network and chipnet share one code path

`runScenario` takes a `NetworkProvider`. Tests pass CashScript's `MockNetworkProvider`, which runs the real script VM. The chipnet scripts pass an `ElectrumNetworkProvider`. Nothing in the scenario logic knows the difference.

## Sources

- CashScript documentation: https://cashscript.org/docs
- CashScript 0.14.0 type definitions (npm)
- BCH BLAZE: https://bchblaze.cash
