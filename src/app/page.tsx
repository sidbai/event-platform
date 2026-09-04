import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">King Juan Soccer</h1>
        <p className="mt-3 text-sm text-neutral-500">
          Seattle youth soccer events. More soccer, less logistics.
        </p>
        <p className="mt-6">
          <Link
            href="/events"
            className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Browse events →
          </Link>
        </p>
        <p className="mt-4 text-xs text-neutral-400">
          Platform under construction. See{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
            docs/architecture.html
          </code>
          .
        </p>
      </div>
    </main>
  );
}
