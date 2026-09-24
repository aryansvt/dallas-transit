import { PROJECT_LABEL } from '../lib/product';
import Link from 'next/link';
import { BrandMark } from './brand-mark';

export function AppHeader({
  onHome,
  about = false,
  preview = false,
}: {
  onHome?: () => void;
  about?: boolean;
  preview?: boolean;
}) {
  const preservePreview = process.env.NODE_ENV === 'development' && preview;
  const identity = (
    <>
      <BrandMark />
      {PROJECT_LABEL}
    </>
  );
  return (
    <header className="app-header">
      {onHome ? (
        <button
          className="project-label"
          onClick={onHome}
          aria-label={`${PROJECT_LABEL} home`}
        >
          {identity}
        </button>
      ) : (
        <Link
          className="project-label"
          href="/"
          prefetch={false}
          aria-label={`${PROJECT_LABEL} home`}
        >
          {identity}
        </Link>
      )}
      <div className="header-secondary">
        <span className="header-context">
          <span className="descriptor-city">Dallas/</span>DART Transit Navigator
        </span>
        <nav aria-label="Main navigation">
          <Link
            className="header-link"
            href="/about"
            prefetch={false}
            aria-current={about ? 'page' : undefined}
            target={preservePreview ? '_blank' : undefined}
            rel={preservePreview ? 'noopener' : undefined}
            aria-label={
              preservePreview ? 'About (opens in a new tab)' : undefined
            }
            title={
              preservePreview
                ? 'Opens in a new tab; your preview stays here'
                : undefined
            }
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
