export default function Spinner() {
  return (
    <div role="status" className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
