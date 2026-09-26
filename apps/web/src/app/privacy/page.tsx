import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '../../components/app-header';
import { PUBLIC_LINKS } from '../../lib/product';

export const metadata: Metadata = { title: 'LineFinder privacy' };
export default function PrivacyPage() {
  return (
    <>
      <a href="#privacy-main" className="skip-link">
        Skip to privacy
      </a>
      <AppHeader />
      <main id="privacy-main" className="about-page">
        <Link href="/" className="about-back" prefetch={false}>
          Back to trip planner
        </Link>
        <h1>Privacy at LineFinder</h1>
        <p className="about-intro">
          An independent, noncommercial Dallas transit project. No accounts,
          analytics, advertising, trackers or session replay.
        </p>
        <section aria-labelledby="device-title">
          <h2 id="device-title">On your device</h2>
          <p>
            Location permission is optional. Your current location stays in page
            memory and is sent when needed to plan a journey or bias a place
            search. You can enter a starting point instead. Saved places and
            eligible recent destinations use your browser’s local storage;
            remove them in the app or clear this site’s browser data. Temporary
            Mapbox search results and GPS origins are not saved there.
          </p>
        </section>
        <section aria-labelledby="providers-title">
          <h2 id="providers-title">Requests and providers</h2>
          <p>
            Vercel serves this website and forwards transit requests to our API
            on Render. Trip endpoints and departure times are processed to plan
            journeys. Mapbox receives place searches, selected places,
            search-session identifiers and location bias when provided. Mapbox
            map requests reveal the viewed area. Geoapify receives walking
            endpoints through our API. DART schedule data supplies transit stops
            and times; DART realtime is disabled.
          </p>
          <p>
            Application logs use status codes, durations and safe diagnostic
            categories, not journey coordinates, search text, credentials or
            provider response bodies. Hosting and map/search providers can
            process network metadata such as IP addresses under their own
            policies. We do not promise that their infrastructure retains no
            logs.
          </p>
          <p>
            <a href="https://www.mapbox.com/legal/privacy">Mapbox privacy</a>
            {' · '}
            <a href="https://www.geoapify.com/privacy-policy/">
              Geoapify privacy
            </a>
            {' · '}
            <a href="https://vercel.com/legal/privacy-policy">Vercel privacy</a>
            {' · '}
            <a href="https://render.com/privacy">Render privacy</a>
          </p>
        </section>
        <section aria-labelledby="offline-title">
          <h2 id="offline-title">Installation and offline use</h2>
          <p>
            You can install LineFinder from a supported browser’s menu or Add to
            Home Screen. An internet connection is needed for fresh searches and
            directions. There is no service worker or offline trip cache. When
            service is unavailable, try again later; do not treat an earlier
            itinerary as a current service update.
          </p>
        </section>
        <section aria-labelledby="privacy-contact-title">
          <h2 id="privacy-contact-title">Questions or concerns</h2>
          <p>
            <a href={PUBLIC_LINKS.email}>Contact Aryan Achar</a>. Please avoid
            including precise trip or location details in public GitHub issues.
          </p>
        </section>
        <p className="about-disclaimer">
          LineFinder is not affiliated with or endorsed by DART.{' '}
          <Link href="/about" prefetch={false}>
            About and attribution
          </Link>
          .
        </p>
      </main>
    </>
  );
}
