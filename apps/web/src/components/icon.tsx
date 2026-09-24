export function Icon({
  name,
  className = '',
}: {
  name:
    | 'pin'
    | 'location'
    | 'search'
    | 'arrow'
    | 'back'
    | 'close'
    | 'clock'
    | 'walk'
    | 'train'
    | 'bus'
    | 'expand'
    | 'star'
    | 'github'
    | 'linkedin'
    | 'email'
    | 'chevron';
  className?: string;
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    location: (
      <>
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    walk: (
      <>
        <circle cx="14" cy="4" r="2" />
        <path d="m7 21 4-7-1-6 4 1 2 5h4M5 12l5-4m1 6 5 7" />
      </>
    ),
    train: (
      <>
        <rect x="5" y="3" width="14" height="15" rx="3" />
        <path d="M5 11h14M9 18l-3 3m9-3 3 3M9 15h.01M15 15h.01" />
      </>
    ),
    bus: (
      <>
        <rect x="5" y="3" width="14" height="16" rx="3" />
        <path d="M5 11h14M8 19v2m8-2v2M8 15h.01m8 0h.01M3 7v4m18-4v4" />
      </>
    ),
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    star: (
      <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z" />
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    github: (
      <>
        <path
          d="M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-2.7c3.3-.4 6.8-1.6 6.8-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.1-4S18-.4 15 1.5a13.7 13.7 0 0 0-6 0C6-.4 4.8 0 4.8 0a5.3 5.3 0 0 0-.1 4 5.7 5.7 0 0 0-1.5 4c0 5.7 3.5 6.9 6.8 7.3A3.5 3.5 0 0 0 9 18v4"
          transform="translate(1 2) scale(.9)"
        />
      </>
    ),
    linkedin: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
        <path d="M7.5 11v6m4.5 0v-6m0 2a3 3 0 0 1 6 0v4" />
      </>
    ),
    email: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
  };
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
