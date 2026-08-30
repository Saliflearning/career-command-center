export default function AppLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-container px-4 py-8 md:px-8 md:py-10">
        <div className="h-8 w-48 rounded-lg bg-surface-container" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-64 rounded-xl bg-surface-container-low" />
          <div className="h-64 rounded-xl bg-surface-container-low" />
        </div>
        <div className="mt-6 h-72 rounded-xl bg-surface-container-low" />
      </div>
    </main>
  );
}
