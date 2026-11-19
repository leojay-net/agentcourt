export default {
  contractName: 'AgentCourt',
  constructorInputs: [
    { name: 'clientPublicKeyHash', type: 'bytes20' },
    { name: 'workerPublicKeyHash', type: 'bytes20' },
    { name: 'firstJurorPublicKey', type: 'pubkey' },
    { name: 'secondJurorPublicKey', type: 'pubkey' },
    { name: 'thirdJurorPublicKey', type: 'pubkey' },
    { name: 'acceptanceHash', type: 'bytes32' },
    { name: 'refundTime', type: 'int' },
  ],
  abi: [
    {
      name: 'settle',
      inputs: [
        { name: 'workerPublicKey', type: 'pubkey' },
        { name: 'workerSignature', type: 'sig' },
        { name: 'deliverable', type: 'bytes' },
      ],
    },
    {
      name: 'refund',
      inputs: [
        { name: 'clientPublicKey', type: 'pubkey' },
        { name: 'clientSignature', type: 'sig' },
      ],
    },
    {
      name: 'rule',
      inputs: [
        { name: 'firstSignature', type: 'sig' },
        { name: 'secondSignature', type: 'sig' },
      ],
    },
  ],
  bytecode: 'c0c4519c00cd537a8700cc5379c602d00794a200d15479ce8700d35579d09c00d2567acf87719a547a9a537a9a7b9a9a OP_0 OP_DEFINE OP_7 OP_PICK OP_0 OP_NUMEQUAL OP_IF OP_8 OP_PICK OP_HASH160 OP_2 OP_PICK OP_EQUALVERIFY OP_9 OP_ROLL OP_9 OP_ROLL OP_CHECKSIGVERIFY OP_8 OP_ROLL OP_SHA256 OP_6 OP_ROLL OP_EQUALVERIFY 76a914 OP_ROT OP_CAT 88ac OP_CAT OP_0 OP_INVOKE OP_VERIFY OP_2DROP OP_2DROP OP_2DROP OP_1 OP_ELSE OP_7 OP_PICK OP_1 OP_NUMEQUAL OP_IF OP_6 OP_ROLL OP_CHECKLOCKTIMEVERIFY OP_DROP OP_7 OP_PICK OP_HASH160 OP_OVER OP_EQUALVERIFY OP_8 OP_ROLL OP_8 OP_ROLL OP_CHECKSIGVERIFY 76a914 OP_SWAP OP_CAT 88ac OP_CAT OP_0 OP_INVOKE OP_VERIFY OP_2DROP OP_2DROP OP_2DROP OP_1 OP_ELSE OP_7 OP_ROLL OP_2 OP_NUMEQUALVERIFY OP_0 OP_8 OP_ROLL OP_9 OP_ROLL OP_2 OP_6 OP_ROLL OP_7 OP_ROLL OP_8 OP_ROLL OP_3 OP_CHECKMULTISIGVERIFY 76a914 OP_SWAP OP_CAT 88ac OP_CAT 76a914 OP_ROT OP_CAT 88ac OP_CAT OP_0 OP_OUTPUTBYTECODE OP_DUP OP_3 OP_ROLL OP_EQUAL OP_OVER OP_3 OP_ROLL OP_EQUAL OP_BOOLOR OP_VERIFY OP_0 OP_INVOKE OP_NIP OP_NIP OP_ENDIF OP_ENDIF',
  source: 'pragma cashscript ^0.14.0;\n\n// Largest miner fee, in satoshis, a spend of this escrow may pay. Anything the\n// spender does not send to the payout output is a fee, so this cap stops a\n// co-signer from skimming the escrow through an inflated fee.\nint constant MAXIMUM_MINER_FEE_SATOSHIS = 2000;\n\n// One escrow between a client agent and a worker agent, arbitrated by a\n// three-member jury. The contract address is a pure function of these terms,\n// so no registry or indexer is needed to find a task.\ncontract AgentCourt(\n    bytes20 clientPublicKeyHash,\n    bytes20 workerPublicKeyHash,\n    pubkey firstJurorPublicKey,\n    pubkey secondJurorPublicKey,\n    pubkey thirdJurorPublicKey,\n    bytes32 acceptanceHash,\n    int refundTime\n) {\n    // Programmatic acceptance. The worker reveals a deliverable whose SHA-256\n    // equals the hash the client committed to when funding. No client approval\n    // is required, so a correct result cannot be held hostage.\n    function settle(pubkey workerPublicKey, sig workerSignature, bytes deliverable) {\n        require(hash160(workerPublicKey) == workerPublicKeyHash);\n        require(checkSig(workerSignature, workerPublicKey));\n        require(sha256(deliverable) == acceptanceHash);\n\n        bytes25 workerLockingBytecode = new LockingBytecodeP2PKH(workerPublicKeyHash);\n        require(isFullPayoutTo(workerLockingBytecode));\n    }\n\n    // Timeout refund. If nothing settled before the deadline the client\n    // reclaims the escrow.\n    function refund(pubkey clientPublicKey, sig clientSignature) {\n        require(tx.time >= refundTime);\n        require(hash160(clientPublicKey) == clientPublicKeyHash);\n        require(checkSig(clientSignature, clientPublicKey));\n\n        bytes25 clientLockingBytecode = new LockingBytecodeP2PKH(clientPublicKeyHash);\n        require(isFullPayoutTo(clientLockingBytecode));\n    }\n\n    // Jury ruling for work that cannot be reduced to a hash. Two of the three\n    // jurors sign a transaction that pays either the worker or the client. A\n    // signature commits to the transaction outputs, so the signature is the vote.\n    function rule(sig firstSignature, sig secondSignature) {\n        require(checkMultiSig(\n            [firstSignature, secondSignature],\n            [firstJurorPublicKey, secondJurorPublicKey, thirdJurorPublicKey]\n        ));\n\n        bytes25 clientLockingBytecode = new LockingBytecodeP2PKH(clientPublicKeyHash);\n        bytes25 workerLockingBytecode = new LockingBytecodeP2PKH(workerPublicKeyHash);\n        bytes payoutLockingBytecode = tx.outputs[0].lockingBytecode;\n        require(payoutLockingBytecode == clientLockingBytecode || payoutLockingBytecode == workerLockingBytecode);\n        require(isFullPayoutTo(payoutLockingBytecode));\n    }\n}\n\n// True when the escrow, including any CashToken balance, leaves in a single\n// output to the named recipient, minus at most the capped miner fee.\nfunction isFullPayoutTo(bytes recipientLockingBytecode) returns (bool) {\n    int escrowIndex = this.activeInputIndex;\n    bool isSingleOutput = tx.outputs.length == 1;\n    bool paysRecipient = tx.outputs[0].lockingBytecode == recipientLockingBytecode;\n    bool keepsValue = tx.outputs[0].value >= tx.inputs[escrowIndex].value - MAXIMUM_MINER_FEE_SATOSHIS;\n    bool keepsTokenCategory = tx.outputs[0].tokenCategory == tx.inputs[escrowIndex].tokenCategory;\n    bool keepsTokenAmount = tx.outputs[0].tokenAmount == tx.inputs[escrowIndex].tokenAmount;\n    bool keepsNftCommitment = tx.outputs[0].nftCommitment == tx.inputs[escrowIndex].nftCommitment;\n    return isSingleOutput && paysRecipient && keepsValue && keepsTokenCategory && keepsTokenAmount && keepsNftCommitment;\n}\n',
  fingerprint: '70351e4ec817f648eb5f7fd8a8e50c7dff70439820aa1405488eabe34ae96211',
  debug: {
    bytecode: '30c0c4519c00cd537a8700cc5379c602d00794a200d15479ce8700d35579d09c00d2567acf87719a547a9a537a9a7b9a9a00895779009c635879a9527988597a597aad587aa8567a880376a9147b7e0288ac7e008a696d6d6d51675779519c63567ab1755779a97888587a587aad0376a9147c7e0288ac7e008a696d6d6d5167577a529d00587a597a52567a577a587a53af0376a9147c7e0288ac7e0376a9147b7e0288ac7e00cd76537a8778537a879b69008a77776868',
    sourceMap: '62::71:1;;::::1;23:4:30:5:0;;;;;24:24:24:39;;:16::40:1;:44::63:0;;:8::65:1;25:25:25:40:0;;:42::57;;:8::60:1;26:23:26:34:0;;:16::35:1;:39::53:0;;:8::55:1;28:40:28:85:0;:65::84;:40::85:1;;;29:16:29:53;;:8::55;23:84:30:5;;;;:4;34::41::0;;;;;35:27:35:37;;:8::39:1;;36:24:36::0;;:16::40:1;:44::63:0;:8::65:1;37:25:37:40:0;;:42::57;;:8::60:1;39:40:39:85:0;:65::84;:40::85:1;;;40:16:40:53;;:8::55;34:65:41:5;;;;:4;46::57::0;;;;47:16:50:9;48:13:48:27;;:29::44;;:12::45:1;49:13:49:32:0;;:34::54;;:56::75;;:12::76:1;47:8:50:11;52:40:52:85:0;:65::84;:40::85:1;;;53::53::0;:65::84;:40::85:1;;;54:49:54:50:0;:38::67:1;55:16:55:37:0;:41::62;;:16:::1;:66::87:0;:91::112;;:66:::1;:16;:8::114;56:16:56:53;:8::55;46:59:57:5;;11:0:58:1;',
    logs: [],
    requires: [
      { ip: 20, line: 24 },
      { ip: 25, line: 25 },
      { ip: 31, line: 26 },
      { ip: 39, line: 29 },
      { ip: 52, line: 35 },
      { ip: 58, line: 36 },
      { ip: 63, line: 37 },
      { ip: 71, line: 40 },
      { ip: 94, line: 47 },
      { ip: 116, line: 55 },
      { ip: 119, line: 56 },
    ],
    sourceTags: '112:113:sc',
    functions: [
      {
        id: 0,
        name: 'isFullPayoutTo',
        inputs: [
          { name: 'recipientLockingBytecode', type: 'bytes' },
        ],
        bytecode: 'c0c4519c00cd537a8700cc5379c602d00794a200d15479ce8700d35579d09c00d2567acf87719a547a9a537a9a7b9a9a',
        sourceMap: '63:22:63:43;64:26:64;:47::48;:26:::1;65:36:65:37:0;:25::54:1;:58::82:0;;:25:::1;66:33:66:34:0;:22::41:1;:55::66:0;;:45::73:1;:76::102;:45;:22;67:41:67:42:0;:30::57:1;:71::82:0;;:61::97:1;:30;68:39:68:40:0;:28::53:1;:67::78:0;;:57::91:1;:28;69:41:69:42:0;:30::57:1;:71::82:0;;:61::97:1;:30;70:11:70:42:0;::::1;:46::56:0;;:11:::1;:60::78:0;;:11:::1;:82::98:0;:11:::1;:::120',
        logs: [],
        requires: [],
        inlineRanges: '14:14:MAXIMUM_MINER_FEE_SATOSHIS',
      },
      {
        name: 'MAXIMUM_MINER_FEE_SATOSHIS',
        kind: 'constant',
        inputs: [],
        bytecode: '02d007',
        sourceMap: '6:42:6:46',
        logs: [],
        requires: [],
      },
    ],
  },
  compiler: {
    name: 'cashc',
    version: '0.14.0',
    options: {
      enforceFunctionParameterTypes: true,
      enforceLocktimeGuard: true,
    },
  },
  updatedAt: '2026-11-19T04:09:28.119Z',
} as const;
