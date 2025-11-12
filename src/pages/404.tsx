export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-3xl font-bold mb-2">Page not found</h1>
      <p className="text-slate-600">The page you’re looking for doesn’t exist.</p>
      <a href="/" className="btn-primary mt-6 inline-block">Back to home</a>
    </div>
  );
}
