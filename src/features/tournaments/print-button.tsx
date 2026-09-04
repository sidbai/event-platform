"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mb-6 rounded-md border border-neutral-400 px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-100 print:hidden"
    >
      Print
    </button>
  );
}
