// Inline stroke-SVG icons (no lucide-react dependency). Deliberately plain —
// these exist to be recognizable at a glance in a small UI, not to be a full
// icon set.

import type { ReactNode } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </Svg>
  );
}

export function FingerprintIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a5 5 0 0 1 5 5v2" />
      <path d="M7 10V8a5 5 0 0 1 1.5-3.6" />
      <path d="M4 15.5A9 9 0 0 1 3 11" />
      <path d="M20.6 15A9 9 0 0 0 21 11" />
      <path d="M9 20.6A9 9 0 0 1 6 18" />
      <path d="M12 22a9 9 0 0 0 4.5-1.2" />
      <path d="M12 10a2 2 0 0 1 2 2v3a4 4 0 0 1-1 2.6" />
      <path d="M9 12v3a5 5 0 0 0 .8 2.7" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
      <circle cx="7.5" cy="15.5" r="5.5" />
    </Svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Svg>
  );
}

export function SpinnerIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={`spw-spin ${className ?? ''}`.trim()}
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.9" />
      <circle cx="12" cy="12" r="10" opacity="0.25" />
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </Svg>
  );
}

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m17 7-10 10" />
      <path d="M17 17H7V7" />
    </Svg>
  );
}

/** The Stacks token glyph: a circular orange-gradient badge with the white
 * Stacks "S" mark, used wherever STX itself is depicted as an asset (the
 * home Assets row, the Send view's static asset row). Not a `Svg` wrapper
 * (fixed viewBox/fill, not currentColor-driven) since it's a brand mark, not
 * a UI stroke icon. */
export function StacksTokenIcon({ size = 40 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: 'linear-gradient(180deg, var(--spw-accent-2), var(--spw-accent))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 32 32" fill="#fff">
        <path d="M24.5 16.978h-17v2.07h5.181L9.071 24.5h2.683l4.239-6.423 4.24 6.423h2.697l-3.611-5.467H24.5v-2.055zM11.71 7.5H9.014l3.568 5.395H7.5v2.084h17v-2.084h-5.081L22.987 7.5h-2.698l-4.296 6.509L11.71 7.5z" />
      </svg>
    </div>
  );
}
