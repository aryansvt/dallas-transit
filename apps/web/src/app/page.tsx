import { TransitApp } from '../components/transit-app';
import { mapboxStyle } from '../lib/map-config';
export default function Home() {
  const mapStyle = mapboxStyle(
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    process.env.NODE_ENV === 'production',
  );
  return <TransitApp {...(mapStyle ? { mapStyle } : {})} />;
}
