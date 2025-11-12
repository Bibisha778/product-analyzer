import Link from 'next/link';
import { useState } from 'react';

export default function Navbar() {
  const [busy, setBusy] = useState(false);

  const deploy = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/deploy', { method: 'POST' });
      const j = await r.json().catch(async () => ({ ok:false, status:r.status, text: await r.text() }));
      if (r.ok && j?.ok) {
        alert(`🚀 Deployment started (status ${j.status}).`);
      } else {
        alert(`⚠️ Deploy failed (status ${j?.status ?? 'n/a'}): ${j?.error || j?.text || 'unknown'}`);
      }
    } catch (e:any) {
      alert(`⚠️ Deploy failed: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="border-b bg-white">
      <nav className="container-pro h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded bg-blue-600" />
          Product Analyzer
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/scan" className="hover:text-blue-700">Scan</Link>
          <a href="https://github.com/Bibisha778/product-analyzer" target="_blank" rel="noreferrer" className="hover:text-blue-700">GitHub</a>
          <button
            onClick={deploy}
            disabled={busy}
            className="inline-flex items-center rounded-lg px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            {busy ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </nav>
    </header>
  );
}
