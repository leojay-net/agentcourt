import { useEffect, useState } from 'react';
import type { CaseRecord } from '../../../src/core/caseRecord';
import { loadCaseRecords } from '../lib/caseRegistry';

export type CaseRecordsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly records: CaseRecord[] }
  | { readonly status: 'failed'; readonly message: string };

export function useCaseRecords(): CaseRecordsState {
  const [state, setState] = useState<CaseRecordsState>({ status: 'loading' });

  useEffect(function loadRecordsOnce() {
    let isActive = true;
    loadCaseRecords()
      .then(function storeRecords(records) {
        if (isActive) {
          setState({ status: 'ready', records });
        }
      })
      .catch(function storeFailure(failure: unknown) {
        if (isActive) {
          const message = failure instanceof Error ? failure.message : 'Unknown error';
          setState({ status: 'failed', message });
        }
      });
    return function cancelLoad() {
      isActive = false;
    };
  }, []);

  return state;
}
