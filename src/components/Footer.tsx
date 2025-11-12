export default function Footer() {
  return (
    <footer className="mt-16 border-t bg-white">
      <div className="container-pro py-6 text-sm text-slate-500 flex items-center justify-between">
        <p>© {new Date().getFullYear()} Product Analyzer</p>
        <p>For demo use. Prices may be incomplete on JS-heavy pages.</p>
      </div>
    </footer>
  );
}
