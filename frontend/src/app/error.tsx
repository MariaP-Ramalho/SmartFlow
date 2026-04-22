"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{
        backgroundColor: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
      }}
    >
      <h1 className="text-lg font-semibold">Algo deu errado ao carregar a página</h1>
      <p className="max-w-md text-sm opacity-90">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Tentar novamente
      </button>
    </div>
  );
}
