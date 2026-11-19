import { motion } from 'motion/react';
import styles from './CourtDiagram.module.css';

export type CourtPath = 'settle' | 'rule' | 'refund';

interface CourtDiagramProps {
  readonly activePath: CourtPath;
}

type EdgeId = 'fund' | 'toWorker' | 'fromJury' | 'toClient';

interface EdgeDescription {
  readonly id: EdgeId;
  readonly pathData: string;
  readonly arrowData: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly labelAnchor: 'start' | 'middle' | 'end';
  readonly label: string;
}

const EDGES: readonly EdgeDescription[] = [
  {
    id: 'fund',
    pathData: 'M136 160H198',
    arrowData: 'M192 155L199 160L192 165',
    labelX: 167,
    labelY: 148,
    labelAnchor: 'middle',
    label: 'fund',
  },
  {
    id: 'toWorker',
    pathData: 'M322 160H384',
    arrowData: 'M378 155L385 160L378 165',
    labelX: 353,
    labelY: 148,
    labelAnchor: 'middle',
    label: 'pay',
  },
  {
    id: 'fromJury',
    pathData: 'M260 72V128',
    arrowData: 'M255 122L260 129L265 122',
    labelX: 272,
    labelY: 104,
    labelAnchor: 'start',
    label: '2 of 3 sign',
  },
  {
    id: 'toClient',
    pathData: 'M260 192C260 262 76 262 76 198',
    arrowData: 'M71 204L76 197L81 204',
    labelX: 168,
    labelY: 250,
    labelAnchor: 'middle',
    label: 'return',
  },
];

const ACTIVE_EDGES_BY_PATH: Readonly<Record<CourtPath, readonly EdgeId[]>> = {
  settle: ['toWorker'],
  rule: ['fromJury', 'toWorker', 'toClient'],
  refund: ['toClient'],
};

function isEdgeActive(edgeId: EdgeId, activePath: CourtPath): boolean {
  return edgeId === 'fund' || ACTIVE_EDGES_BY_PATH[activePath].includes(edgeId);
}

function isNodeActive(nodeName: 'client' | 'worker' | 'jury', activePath: CourtPath): boolean {
  switch (nodeName) {
    case 'client':
      return activePath === 'refund' || activePath === 'rule';
    case 'worker':
      return activePath === 'settle' || activePath === 'rule';
    case 'jury':
      return activePath === 'rule';
  }
}

export function CourtDiagram({ activePath }: CourtDiagramProps) {
  return (
    <svg
      viewBox="0 0 520 290"
      className={styles.diagram}
      role="img"
      aria-label={`Funds move from the client into the covenant, then leave by the ${activePath} path`}
    >
      {EDGES.map(function renderEdge(edge) {
        const isActive = isEdgeActive(edge.id, activePath);
        const strokeColor = isActive ? 'var(--color-primary)' : 'var(--color-line-strong)';
        const isDashed = activePath === 'rule' && edge.id === 'toClient';
        return (
          <g key={`${edge.id}-${activePath}`}>
            <motion.path
              d={edge.pathData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isActive ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={isDashed ? '5 6' : undefined}
              initial={{ pathLength: isActive && edge.id !== 'fund' ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}
            />
            <motion.path
              d={edge.arrowData}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isActive ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: isActive && edge.id !== 'fund' ? 0 : 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: isActive && edge.id !== 'fund' ? 0.4 : 0 }}
            />
            <text
              x={edge.labelX}
              y={edge.labelY}
              textAnchor={edge.labelAnchor}
              className={styles.edgeLabel}
              data-active={isActive}
            >
              {edge.label}
            </text>
          </g>
        );
      })}

      <Node x={16} y={130} width={120} height={60} title="Client" caption="funds the task" isActive={isNodeActive('client', activePath)} />
      <Node x={384} y={130} width={120} height={60} title="Worker" caption="does the task" isActive={isNodeActive('worker', activePath)} />
      <Node x={200} y={20} width={120} height={52} title="Jury" caption="three keys" isActive={isNodeActive('jury', activePath)} />

      <rect x={198} y={128} width={124} height={64} rx={10} className={styles.covenant} />
      <text x={260} y={157} textAnchor="middle" className={styles.covenantTitle}>
        Covenant
      </text>
      <text x={260} y={176} textAnchor="middle" className={styles.covenantCaption}>
        CashScript
      </text>
    </svg>
  );
}

interface NodeProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly caption: string;
  readonly isActive: boolean;
}

function Node({ x, y, width, height, title, caption, isActive }: NodeProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        className={styles.node}
        data-active={isActive}
      />
      <text x={x + width / 2} y={y + height / 2 - 2} textAnchor="middle" className={styles.nodeTitle}>
        {title}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 16} textAnchor="middle" className={styles.nodeCaption}>
        {caption}
      </text>
    </g>
  );
}
