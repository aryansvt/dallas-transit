/** Compact origin → path → star. Color is optional; the silhouette works alone. */
export function BrandMark({ monochrome = false }: { monochrome?: boolean }) {
  return (
    <svg
      className="brand-mark"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M7 25V15a6 6 0 0 1 6-6h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="7"
        cy="25"
        r="3.5"
        fill={monochrome ? 'currentColor' : 'var(--accent)'}
      />
      <path
        d="m24 2 1.8 4.9 5.2.2-4.1 3.3 1.4 5-4.3-2.9-4.3 2.9 1.4-5L17 7.1l5.2-.2Z"
        transform="translate(24 9) scale(.847) translate(-24 -9)"
        fill={monochrome ? 'currentColor' : 'var(--accent)'}
      />
    </svg>
  );
}
