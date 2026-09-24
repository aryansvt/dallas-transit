import { TransitApp } from '../components/transit-app';
export default function Home() {
  return (
    <TransitApp
      {...(process.env.NEXT_PUBLIC_MAP_STYLE_URL
        ? { mapStyle: process.env.NEXT_PUBLIC_MAP_STYLE_URL }
        : {})}
    />
  );
}
