import { MotionConfig } from 'motion/react';
import { useCaseRecords } from './hooks/useCaseRecords';
import { Docket } from './components/Docket';
import { EscrowDrafter } from './components/EscrowDrafter';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PathExplorer } from './components/PathExplorer';

export function App() {
  const recordsState = useCaseRecords();
  const records = recordsState.status === 'ready' ? recordsState.records : [];
  const firstRecord = records[0];

  const sampleAddresses =
    firstRecord === undefined
      ? null
      : { client: firstRecord.clientAddress, worker: firstRecord.workerAddress };
  const sampleJurorKeys = firstRecord === undefined ? null : firstRecord.terms.jurorPublicKeysHex;

  return (
    <MotionConfig reducedMotion="user">
      <Header />
      <main>
        <Hero records={records} />
        <PathExplorer />
        <Docket recordsState={recordsState} />
        <EscrowDrafter sampleAddresses={sampleAddresses} sampleJurorKeys={sampleJurorKeys} />
      </main>
      <Footer />
    </MotionConfig>
  );
}
