import type { LucideIcon, LucideProps } from 'lucide-react';

/** Feather-style outline icons on a 24px grid: stroke 2, square caps, mitred joins (Wire code). */
export function Icon({ as: Glyph, size = 20, ...props }: { as: LucideIcon } & LucideProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      {...props}
    />
  );
}
