import { readFileSync } from 'node:fs';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { z } from 'zod';
import { createAgentIdentityFromHex, type AgentIdentity } from '../core/identity';
import { decodeHex } from '../core/hex';
import type { EscrowParties } from './courtAgentTools';
import { createJobStore, type JobStore } from './jobStore';

const PUBLIC_KEY_HASH_BYTE_LENGTH = 20;
const COMPRESSED_PUBLIC_KEY_BYTE_LENGTH = 33;

const agentConfigSchema = z.object({
  role: z.enum(['client', 'worker']),
  privateKeyHex: z.string().length(64),
  jobDirectory: z.string(),
  parties: z.object({
    clientPublicKeyHashHex: z.string(),
    workerPublicKeyHashHex: z.string(),
    jurorPublicKeysHex: z.tuple([z.string(), z.string(), z.string()]),
  }),
});

export type AgentConfigFile = z.infer<typeof agentConfigSchema>;

export interface LoadedAgentConfig {
  readonly role: AgentConfigFile['role'];
  readonly provider: ElectrumNetworkProvider;
  readonly identity: AgentIdentity;
  readonly parties: EscrowParties;
  readonly jobStore: JobStore;
}

/** An agent process receives its own key and the public parties of the escrow, never anyone else's key. */
export async function loadAgentConfig(configFilePath: string): Promise<LoadedAgentConfig> {
  let config: AgentConfigFile;
  try {
    config = agentConfigSchema.parse(JSON.parse(readFileSync(configFilePath, 'utf-8')));
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : String(failure);
    throw new Error(`Agent config ${configFilePath} is unreadable or invalid: ${reason}`);
  }
  const provider = new ElectrumNetworkProvider(Network.CHIPNET, { manualConnectionManagement: true });
  await provider.connect();
  const [firstJurorHex, secondJurorHex, thirdJurorHex] = config.parties.jurorPublicKeysHex;
  return {
    role: config.role,
    provider,
    identity: createAgentIdentityFromHex(config.role, config.privateKeyHex, 'chipnet'),
    parties: {
      clientPublicKeyHash: decodeHex(config.parties.clientPublicKeyHashHex, PUBLIC_KEY_HASH_BYTE_LENGTH),
      workerPublicKeyHash: decodeHex(config.parties.workerPublicKeyHashHex, PUBLIC_KEY_HASH_BYTE_LENGTH),
      jurorPublicKeys: [
        decodeHex(firstJurorHex, COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
        decodeHex(secondJurorHex, COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
        decodeHex(thirdJurorHex, COMPRESSED_PUBLIC_KEY_BYTE_LENGTH),
      ],
    },
    jobStore: createJobStore(config.jobDirectory),
  };
}
