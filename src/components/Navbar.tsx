import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="border-b bg-white">
      <nav className="container-pro h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded bg-blue-600"></span>
          Product Analyzer
        </Link>
        <div className="text-sm text-slate-600">
          <a href="https://github.com/Bibisha778/product-analyzer" target="_blank" rel="noreferrer" className="hover:text-blue-700">GitHub</a>
        </div>
        <a href="/scan" class="text-sm text-slate-600 hover:text-blue-700">Scan</a>
      </nav>
    </header>
  );
}
