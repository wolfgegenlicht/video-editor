// frontend/src/components/Icons.tsx

interface IconProps { className?: string }

export function UndoIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5h7a3 3 0 0 1 0 6H5" />
      <path d="M2 5l3-3M2 5l3 3" />
    </svg>
  );
}

export function RedoIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5H5a3 3 0 0 0 0 6h3" />
      <path d="M12 5l-3-3M12 5l-3 3" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8.5 2.5L5 6.5l3.5 4" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 2.5L8 6.5l-3.5 4" />
    </svg>
  );
}

export function VolumeXIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5H4.5L7.5 2.5v9L4.5 9H2V5z" />
      <path d="M10 5l3 4M13 5l-3 4" />
    </svg>
  );
}

export function Volume2Icon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5H4.5L7.5 2.5v9L4.5 9H2V5z" />
      <path d="M10 5a3 3 0 0 1 0 4" />
    </svg>
  );
}

export function EyeIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="7" cy="7" rx="5.5" ry="3.5" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  );
}

export function EyeOffIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 2l10 10" />
      <path d="M6 5.2A3 3 0 0 1 9.5 9M3.5 4A6.5 6.5 0 0 0 1.5 7c1 2.5 3 4 5.5 4 1 0 2-.3 2.8-.8" />
      <path d="M5 3.2A6.5 6.5 0 0 1 7 2.5c2.5 0 4.5 1.5 5.5 4a6.5 6.5 0 0 1-1.1 2" />
    </svg>
  );
}

export function ScissorsIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="3" cy="4" r="1.5" />
      <circle cx="3" cy="10" r="1.5" />
      <path d="M4.5 4.5L11 11M4.5 9.5L11 3" />
    </svg>
  );
}

export function SplitIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 1.5h11M6.5 1.5v10M1 11.5h11" />
    </svg>
  );
}

export function CopyIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
      <path d="M10 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" />
    </svg>
  );
}

export function AudioLinesIcon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5H4.5L7 2.5v9L4.5 9H2V5z" />
      <path d="M9.5 2a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function Trash2Icon({ className = "" }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 4h10M5 4V3h4v1M4.5 4v7a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V4" />
    </svg>
  );
}

export function MusicIcon({ className = "" }: IconProps) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.5 10V3.5L10 2.5V9" />
      <circle cx="3" cy="10" r="1.5" />
      <circle cx="8.5" cy="9" r="1.5" />
    </svg>
  );
}

export function WarningIcon({ className = "" }: IconProps) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6.5 1L12 12H1L6.5 1z" />
      <path d="M6.5 5v3M6.5 9.5v.5" />
    </svg>
  );
}
