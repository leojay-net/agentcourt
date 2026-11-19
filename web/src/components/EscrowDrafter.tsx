import { AnimatePresence, motion } from 'motion/react';
import { useId, useState, type FormEvent } from 'react';
import { readAddressBalance } from '../lib/chain';
import { DraftValidationError, draftEscrow, type AcceptanceMode, type EscrowDraft } from '../lib/draftEscrow';
import { addressUrl, formatSatoshis, shortenAddress } from '../lib/format';
import { ActionButton } from './Button';
import { CopyableValue } from './CopyableValue';
import { ArrowUpRightIcon } from './Icons';
import styles from './EscrowDrafter.module.css';

interface EscrowDrafterProps {
  readonly sampleAddresses: { readonly client: string; readonly worker: string } | null;
  readonly sampleJurorKeys: readonly [string, string, string] | null;
}

const DEFAULT_REFUND_AFTER_BLOCKS = 144;

export function EscrowDrafter({ sampleAddresses, sampleJurorKeys }: EscrowDrafterProps) {
  const formId = useId();
  const [clientAddress, setClientAddress] = useState('');
  const [workerAddress, setWorkerAddress] = useState('');
  const [jurorKeys, setJurorKeys] = useState<[string, string, string]>(['', '', '']);
  const [acceptanceMode, setAcceptanceMode] = useState<AcceptanceMode>('hash');
  const [expectedDeliverable, setExpectedDeliverable] = useState('');
  const [refundAfterBlocks, setRefundAfterBlocks] = useState(String(DEFAULT_REFUND_AFTER_BLOCKS));
  const [isDrafting, setIsDrafting] = useState(false);
  const [validationError, setValidationError] = useState<DraftValidationError | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<EscrowDraft | null>(null);

  function fillWithSamples(): void {
    if (sampleAddresses !== null) {
      setClientAddress(sampleAddresses.client);
      setWorkerAddress(sampleAddresses.worker);
    }
    if (sampleJurorKeys !== null) {
      setJurorKeys([sampleJurorKeys[0], sampleJurorKeys[1], sampleJurorKeys[2]]);
    }
  }

  function updateJurorKey(jurorIndex: 0 | 1 | 2, value: string): void {
    setJurorKeys(function replaceKey(currentKeys) {
      const nextKeys: [string, string, string] = [...currentKeys];
      nextKeys[jurorIndex] = value;
      return nextKeys;
    });
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsDrafting(true);
    setValidationError(null);
    setFailureMessage(null);
    try {
      const nextDraft = await draftEscrow({
        clientAddress,
        workerAddress,
        jurorPublicKeysHex: jurorKeys,
        acceptanceMode,
        expectedDeliverable,
        refundAfterBlocks: Number(refundAfterBlocks),
      });
      setDraft(nextDraft);
    } catch (failure) {
      setDraft(null);
      if (failure instanceof DraftValidationError) {
        setValidationError(failure);
      } else {
        setFailureMessage('Could not reach chipnet to read the current block height. Try again in a moment.');
      }
    } finally {
      setIsDrafting(false);
    }
  }

  function errorFor(fieldName: string): string | undefined {
    return validationError?.fieldName === fieldName ? validationError.message : undefined;
  }

  return (
    <section id="draft" className={styles.section}>
      <div className="container">
        <p className="eyebrow">Bring your own agents</p>
        <h2 className={styles.title}>Draft an escrow</h2>
        <p className={styles.intro}>
          The covenant address is a pure function of the task terms, so there is nothing to
          register. Enter the parties, get the address, and send funds to it from any chipnet
          wallet.
        </p>

        <div className={styles.layout}>
          <form className={styles.form} onSubmit={submitDraft} noValidate>
            <div className={styles.formHeader}>
              <h3 className={styles.formTitle}>Task terms</h3>
              {sampleAddresses !== null || sampleJurorKeys !== null ? (
                <ActionButton type="button" variant="quiet" onClick={fillWithSamples}>
                  Use the demo agents
                </ActionButton>
              ) : null}
            </div>

            <Field id={`${formId}-client`} label="Client address" error={errorFor('client')}>
              <input
                id={`${formId}-client`}
                className={styles.input}
                value={clientAddress}
                onChange={function onChange(event) {
                  setClientAddress(event.target.value);
                }}
                placeholder="bchtest:q..."
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field id={`${formId}-worker`} label="Worker address" error={errorFor('worker')}>
              <input
                id={`${formId}-worker`}
                className={styles.input}
                value={workerAddress}
                onChange={function onChange(event) {
                  setWorkerAddress(event.target.value);
                }}
                placeholder="bchtest:q..."
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            {([0, 1, 2] as const).map(function renderJurorField(jurorIndex) {
              const fieldName = `juror${jurorIndex + 1}`;
              return (
                <Field
                  key={fieldName}
                  id={`${formId}-${fieldName}`}
                  label={`Juror ${jurorIndex + 1} public key`}
                  error={errorFor(fieldName)}
                >
                  <input
                    id={`${formId}-${fieldName}`}
                    className={styles.input}
                    value={jurorKeys[jurorIndex]}
                    onChange={function onChange(event) {
                      updateJurorKey(jurorIndex, event.target.value);
                    }}
                    placeholder="02..."
                    autoComplete="off"
                    spellCheck={false}
                  />
                </Field>
              );
            })}

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>How is the work accepted?</legend>
              <div className={styles.choices}>
                <label className={styles.choice} data-selected={acceptanceMode === 'hash'}>
                  <input
                    type="radio"
                    name={`${formId}-mode`}
                    checked={acceptanceMode === 'hash'}
                    onChange={function selectHash() {
                      setAcceptanceMode('hash');
                    }}
                  />
                  <span>
                    <strong>Hash check</strong>
                    <small>The covenant verifies the exact result.</small>
                  </span>
                </label>
                <label className={styles.choice} data-selected={acceptanceMode === 'jury'}>
                  <input
                    type="radio"
                    name={`${formId}-mode`}
                    checked={acceptanceMode === 'jury'}
                    onChange={function selectJury() {
                      setAcceptanceMode('jury');
                    }}
                  />
                  <span>
                    <strong>Jury only</strong>
                    <small>Two of three jurors decide.</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <AnimatePresence initial={false}>
              {acceptanceMode === 'hash' ? (
                <motion.div
                  key="deliverable"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
                  className={styles.collapsible}
                >
                  <Field id={`${formId}-deliverable`} label="Exact expected result" error={errorFor('deliverable')}>
                    <textarea
                      id={`${formId}-deliverable`}
                      className={`${styles.input} ${styles.textarea}`}
                      value={expectedDeliverable}
                      onChange={function onChange(event) {
                        setExpectedDeliverable(event.target.value);
                      }}
                      rows={3}
                      placeholder='[120,185,240]'
                      spellCheck={false}
                    />
                  </Field>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Field id={`${formId}-refund`} label="Client can refund after (blocks)" error={errorFor('refund')}>
              <input
                id={`${formId}-refund`}
                className={`${styles.input} tabular`}
                inputMode="numeric"
                value={refundAfterBlocks}
                onChange={function onChange(event) {
                  setRefundAfterBlocks(event.target.value);
                }}
              />
            </Field>

            {errorFor('terms') !== undefined ? <p className={styles.error} role="alert">{errorFor('terms')}</p> : null}
            {failureMessage !== null ? <p className={styles.error} role="alert">{failureMessage}</p> : null}

            <ActionButton type="submit" isLoading={isDrafting}>
              Compute covenant address
            </ActionButton>
          </form>

          <div className={styles.result}>
            <AnimatePresence mode="wait" initial={false}>
              {draft === null ? (
                <motion.div
                  key="empty"
                  className={styles.emptyResult}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p>The covenant address and the full terms appear here.</p>
                </motion.div>
              ) : (
                <DraftResult key={draft.contractAddress} draft={draft} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly error: string | undefined;
  readonly children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className={styles.field} data-invalid={error !== undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DraftResult({ draft }: { readonly draft: EscrowDraft }) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [balanceFailed, setBalanceFailed] = useState(false);

  async function checkBalance(): Promise<void> {
    setIsChecking(true);
    setBalanceFailed(false);
    try {
      setBalance(await readAddressBalance(draft.contractAddress));
    } catch {
      setBalanceFailed(true);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <motion.div
      className={styles.resultCard}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <p className="eyebrow">Covenant address</p>
      <p className={`${styles.address} mono`}>{draft.contractAddress}</p>
      <div className={styles.resultActions}>
        <CopyableValue
          value={draft.contractAddress}
          displayText={shortenAddress(draft.contractAddress)}
          accessibleLabel="covenant address"
        />
        <a className={styles.explorerLink} href={addressUrl(draft.contractAddress)} target="_blank" rel="noreferrer">
          Explorer <ArrowUpRightIcon size={14} />
        </a>
      </div>

      <div className={styles.balanceRow}>
        <ActionButton type="button" variant="secondary" isLoading={isChecking} onClick={checkBalance}>
          Check balance
        </ActionButton>
        <p className="tabular" aria-live="polite">
          {balance !== null ? `${formatSatoshis(Number(balance))} sats held` : null}
          {balanceFailed ? 'Could not read the balance.' : null}
        </p>
      </div>

      <p className="eyebrow">Terms</p>
      <pre className={`${styles.terms} mono`}>{JSON.stringify(draft.terms, null, 2)}</pre>
    </motion.div>
  );
}
