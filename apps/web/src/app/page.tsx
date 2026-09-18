export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-5 px-6 py-16">
      <p className="text-sm font-semibold tracking-wide text-emerald-800">
        In development
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Dallas Transit Navigator
      </h1>
      <p className="text-lg leading-relaxed text-slate-700">
        An open-source transit navigator for Dallas. Journey planning is coming
        in a future milestone.
      </p>
      <p className="text-sm text-slate-600">
        This development preview is not ready for travel planning.
      </p>
    </main>
  );
}
