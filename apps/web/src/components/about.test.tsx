// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import AboutPage from '../app/about/page';
import { AppHeader } from './app-header';
import { PUBLIC_LINKS } from '../lib/product';

it('provides named keyboard-reachable navigation and supplied public contact links without a planner or location prompt', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AboutPage />));
    expect(container.querySelector('h1')?.textContent).toBe('About LineFinder');
    const about = container.querySelector<HTMLAnchorElement>('nav a')!;
    about.focus();
    expect(document.activeElement).toBe(about);
    expect(about.getAttribute('aria-current')).toBe('page');
    expect(
      container
        .querySelector('[aria-label="LineFinder home"]')
        ?.getAttribute('href'),
    ).toBe('/');
    expect(container.querySelector('#contact-title')?.textContent).toBe(
      'Contact links',
    );
    const contacts =
      container.querySelectorAll<HTMLAnchorElement>('.about-links a');
    expect(contacts).toHaveLength(3);
    for (const [index, [href, label]] of [
      [PUBLIC_LINKS.github, 'LineFinder on GitHub'],
      [PUBLIC_LINKS.linkedin, 'Aryan Achar on LinkedIn'],
      [PUBLIC_LINKS.email, 'Email Aryan Achar'],
    ].entries()) {
      const link = contacts[index]!;
      expect(link.getAttribute('href')).toBe(href);
      expect(link.getAttribute('aria-label')).toBe(label);
      expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(link.textContent?.trim()).toBe('');
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    expect(container.textContent).toContain(
      'not affiliated with or endorsed by DART',
    );
    expect(container.textContent).toContain('no realtime tracking');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('[aria-label="Journey map"]')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each([
  ['development', true, '_blank'],
  ['development', false, null],
  ['production', true, null],
] as const)(
  'preserves the original preview tab only in development (%s, preview %s)',
  async (environment, preview, target) => {
    vi.stubEnv('NODE_ENV', environment);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(<AppHeader preview={preview} />));
      const about = container.querySelector<HTMLAnchorElement>('nav a')!;
      expect(about.getAttribute('href')).toBe('/about');
      expect(about.getAttribute('target')).toBe(target);
      expect(about.getAttribute('rel')).toBe(target ? 'noopener' : null);
      expect(about.getAttribute('aria-label')).toBe(
        target ? 'About (opens in a new tab)' : null,
      );
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllEnvs();
    }
  },
);
