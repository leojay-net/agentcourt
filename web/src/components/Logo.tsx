interface LogoMarkProps {
  readonly size?: number;
}

/**
 * The mark is a balance beam: one pan holds a filled block (funds locked), the
 * other an outlined block (funds released). The pivot is the covenant.
 */
export function LogoMark({ size = 32 }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="AgentCourt"
    >
      <rect width="32" height="32" rx="7" fill="var(--color-primary)" />
      <circle cx="16" cy="7.5" r="2.25" fill="var(--color-paper)" />
      <path d="M5 12H27" stroke="var(--color-paper)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M7 12V19M25 12V19"
        stroke="var(--color-paper)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="3.75" y="19" width="6.5" height="6.5" rx="1.25" fill="var(--color-paper)" />
      <rect
        x="21.75"
        y="19.75"
        width="6.5"
        height="5"
        rx="1.25"
        stroke="var(--color-paper)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={28} />
      <span className="wordmark-text">AgentCourt</span>
    </span>
  );
}
