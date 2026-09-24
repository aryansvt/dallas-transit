import { notFound } from 'next/navigation';

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; embedded?: string }>;
}) {
  // A positive build-time branch excludes the import graph, not just the page UI.
  if (process.env.NODE_ENV === 'development') {
    const [{ PreviewWorkspace }, { scenarios }] = await Promise.all([
      import('../../preview/preview-workspace'),
      import('../../preview/fixtures'),
    ]);
    const params = await searchParams;
    const initialScenario =
      params.state && Object.hasOwn(scenarios, params.state)
        ? (params.state as keyof typeof scenarios)
        : 'granted';
    return (
      <PreviewWorkspace
        initialScenario={initialScenario}
        embedded={params.embedded === '1'}
      />
    );
  }
  notFound();
}
