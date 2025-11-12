export default function Error500() {
  return (
    <div className="text-center py-20">
      <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
      <p className="text-slate-600">Please try again in a moment.</p>
      <a href="/" className="btn-primary mt-6 inline-block">Back to home</a>
    </div>
  );
}
