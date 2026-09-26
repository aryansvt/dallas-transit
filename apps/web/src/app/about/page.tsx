import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '../../components/app-header';
import { Icon } from '../../components/icon';
import { PROJECT_LABEL, PUBLIC_LINKS } from '../../lib/product';

export const metadata: Metadata = { title: `About ${PROJECT_LABEL}` };

export default function AboutPage() {
  return (
    <>
      <a href="#about-main" className="skip-link">
        Skip to About {PROJECT_LABEL}
      </a>
      <AppHeader about />
      <main id="about-main" className="about-page">
        <Link className="about-back" href="/" prefetch={false}>
          Back to trip planner
        </Link>
        <h1>About {PROJECT_LABEL}</h1>
        <p className="about-intro">
          An independent open-source project making Dallas-area public-transit
          journeys easier to understand and follow.
        </p>
        <section aria-labelledby="capabilities-title">
          <h2 id="capabilities-title">Built around the journey</h2>
          <p>
            {PROJECT_LABEL} brings together DART schedules, custom transit
            routing and geographic planning for the walks at either end of a
            trip. Compare route options and follow structured instructions for
            boarding, riding, transferring and arriving.
          </p>
          <p>
            Configured deployments use Mapbox for place search and street maps,
            DART schedule data for stop search, and Geoapify for walking routes.
            Directions currently use scheduled times, with no realtime tracking
            until authorized DART data is available.
          </p>
          <p>
            This is an application in development, intended for public use. For
            travel today, check current schedules and service notices with DART.
          </p>
        </section>
        <section aria-labelledby="creator-title">
          <h2 id="creator-title">About the creator</h2>
          <p>
            {PROJECT_LABEL} was designed and built by Aryan Achar, a Computer
            Science student at The University of Texas at Dallas. It is an
            independent software and open-source project motivated by practical
            Dallas public-transit use.
          </p>
        </section>
        <section aria-labelledby="data-title">
          <h2 id="data-title">Data and privacy</h2>
          <p>
            Transit schedules: DART GTFS Schedule. Place search and basemap:
            Mapbox, with OpenStreetMap map attribution. Walking directions:
            Geoapify. Transit routing: LineFinder’s own RAPTOR engine.
          </p>
          <p>
            <Link href="/privacy" prefetch={false}>
              Privacy and installation
            </Link>
            . Check <a href="https://www.dart.org/">DART</a> for official
            schedules and service notices.
          </p>
        </section>
        <section aria-labelledby="contact-title">
          <h2 id="contact-title">Contact links</h2>
          <ul className="about-links">
            <li>
              <a
                href={PUBLIC_LINKS.github}
                aria-label={`${PROJECT_LABEL} on GitHub`}
                title="GitHub"
              >
                <Icon name="github" />
              </a>
            </li>
            <li>
              <a
                href={PUBLIC_LINKS.linkedin}
                aria-label="Aryan Achar on LinkedIn"
                title="LinkedIn"
              >
                <Icon name="linkedin" />
              </a>
            </li>
            <li>
              <a
                href={PUBLIC_LINKS.email}
                aria-label="Email Aryan Achar"
                title="Email"
              >
                <Icon name="email" />
              </a>
            </li>
          </ul>
        </section>
        <p className="about-disclaimer">
          {PROJECT_LABEL} is an independent third-party project and is not
          affiliated with or endorsed by DART.
        </p>
      </main>
    </>
  );
}
