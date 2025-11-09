'use client';

import { useEffect, useMemo, useState } from 'react';

type ApiResult = {
  title: string;
  price: string;         // "$12.34" or "N/A"
  score: number;         // 0..100
  netProfit?: number;    // number
  marginPct?: number;    // number
  image?: string;        // og:image
  site?: string;         // domain
  error?: string;
  detail?: string;
};

type HistoryItem = {
  url: string;
  title: string;
  price: string;
  score: number;
  when: number;
};

const presets = [
  { name: 'Amazon', feesPct: 15, match: /amazon\./i },
  { name: 'eBay', feesPct: 13, match: /ebay\./i },
  { name: 'Shopify', feesPct: 3, match: /myshopify\.|shopify\.|store\./i },
  { name: 'Newegg', feesPct: 12, match: /newegg\./i },
  { name: 'Generic', feesPct: 10, match: /.*/ },
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [cost, setCost] = useState('0');
  const [feesPct, setFeesPct] = useState('12');
  const [shipping, setShipping] = useState('0');
  const [other, setOther] = useState('0');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Dark mode persistence
  useEffect(() => {
    const saved = localStorage.getItem('pa_dark');
    if (saved) setDark(saved === '1');
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('pa_dark', dark ? '1' : '0');
  }, [dark]);

  // Autofill fee preset based on URL domain
  useEffect(() => {
    if (!url) return;
    const preset = presets.find(p => p.match.test(url)) || presets[presets.length - 1];
    setFeesPct(String(preset.feesPct));
  }, [url]);

  // Load & save history
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pa_history');
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('pa_history', JSON.stringify(history.slice(0, 15))); } catch {}
  }, [history]);

  const parsedCost = useMemo(() => Number.parseFloat(cost || '0') || 0, [cost]);
  const parsedFees = useMemo(() => Number.parseFloat(feesPct || '0') || 0, [feesPct]);
  const parsedShip = useMemo(() => Number.parseFloat(shipping || '0') || 0, [shipping]);
  const parsedOther = useMemo(() => Number.parseFloat(other || '0') || 0, [other]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (!/^https?:\/\//i.test(url)) {
        setLoading(false);
        return setError('Please paste a full URL starting with http or https.');
      }
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          cost: parsedCost,
          feesPct: parsedFees,
          shipping: parsedShip,
          other: parsedOther,
        }),
      });
      const data: ApiResult = await res.json();
      if (!res.ok) {
        setError(data?.error || data?.detail || 'Failed to analyze product');
      } else {
        setResult(data);
        setHistory(prev => [
          { url, title: data.title, price: data.price, score: data.score, when: Date.now() },
          ...prev.filter(h => h.url !== url),
        ]);
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const scoreClass = (s: number) =>
    s >= 70 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
    : s >= 40 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
    : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur dark:bg-slate-950/70 dark:border-slate-800">
        <div className="container-pro py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-slate-900 dark:bg-slate-100" />
            <div className="font-semibold tracking-tight">Product Analyzer</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDark(d => !d)}
              className="btn border dark:border-slate-700"
              title="Toggle theme"
            >
              {dark ? '🌙 Dark' : '☀️ Light'}
            </button>
            <a
              href="https://vercel.com/new"
              target="_blank"
              rel="noreferrer"
              className="btn border hover:bg-slate-50 dark:hover:bg-slate-900 dark:border-slate-700"
            >
              Deploy
            </a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container-pro py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Form */}
          <section className="lg:col-span-2 card p-6">
            <h1 className="text-2xl md:text-3xl font-bold">Analyze any product link</h1>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Paste a URL, add your costs, and get instant score, profit, and margin.
            </p>

            {/* URL */}
            <div className="mt-6">
              <label className="text-sm font-medium">Product URL</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="url"
                  placeholder="https://example.com/product/123"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input"
                />
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="btn btn-primary whitespace-nowrap"
                >
                  {loading ? 'Analyzing…' : 'Analyze'}
                </button>
                {/* Added Scan Barcode button */}
                <a
                  href="/scan"
                  className="ml-2 inline-flex items-center rounded-lg border px-4 py-2 text-sm"
                >
                  Scan Barcode
                </a>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Amazon/BestBuy may hide prices in free mode. Use BooksToScrape/Newegg for perfect demos.
              </p>
            </div>

            {/* Presets */}
            <div className="mt-6">
              <span className="text-sm font-medium">Quick presets</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setFeesPct(String(p.feesPct))}
                    className="badge border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                    title={`${p.name} fees ≈ ${p.feesPct}%`}
                  >
                    {p.name} · {p.feesPct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Cost grid */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-sm font-medium">Your Cost ($)</label>
                <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="mt-1 input" />
              </div>
              <div>
                <label className="text-sm font-medium">Fees (%)</label>
                <input type="number" step="0.1" value={feesPct} onChange={(e) => setFeesPct(e.target.value)} className="mt-1 input" />
              </div>
              <div>
                <label className="text-sm font-medium">Shipping ($)</label>
                <input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} className="mt-1 input" />
              </div>
              <div>
                <label className="text-sm font-medium">Other ($)</label>
                <input type="number" step="0.01" value={other} onChange={(e) => setOther(e.target.value)} className="mt-1 input" />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="mt-6 grid md:grid-cols-5 gap-5">
                {/* Image */}
                <div className="md:col-span-2 card p-3 flex items-center justify-center overflow-hidden">
                  {result.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.image} alt={result.title} className="max-h-64 object-contain" />
                  ) : (
                    <div className="text-sm text-slate-500">No image</div>
                  )}
                </div>

                {/* Details */}
                <div className="md:col-span-3 card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Product</div>
                      <h2 className="text-lg font-semibold">{result.title}</h2>
                      {result.site && <div className="mt-1 text-xs text-slate-500">{result.site}</div>}
                    </div>
                    <div className={`badge ${scoreClass(result.score)}`}>Score: {result.score}/100</div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-3 dark:border-slate-700">
                      <div className="text-xs text-slate-500">Selling Price</div>
                      <div className="text-lg font-semibold">{result.price}</div>
                    </div>
                    <div className="rounded-xl border p-3 dark:border-slate-700">
                      <div className="text-xs text-slate-500">Net Profit</div>
                      <div className="text-lg font-semibold">
                        {typeof result.netProfit === 'number' ? `$${result.netProfit.toFixed(2)}` : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3 dark:border-slate-700">
                      <div className="text-xs text-slate-500">Margin</div>
                      <div className="text-lg font-semibold">
                        {typeof result.marginPct === 'number' ? `${result.marginPct.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => copy(result.title)} className="btn border hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Copy Title</button>
                    <button onClick={() => copy(result.price)} className="btn border hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Copy Price</button>
                    <button onClick={() => copy(`${result.title} | ${result.price}`)} className="btn border hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Copy Both</button>
                  </div>

                  <div className="mt-4 text-xs text-slate-500">
                    * Estimates only. Some sites hide prices in free mode.
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Right: History */}
          <aside className="card p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recent analyses</h3>
              <button onClick={() => setHistory([])} className="text-sm text-slate-500 hover:underline">Clear</button>
            </div>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No history yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {history.slice(0, 10).map((h) => (
                  <li key={h.url} className="rounded-lg border p-3 hover:bg-slate-50 dark:hover:bg-slate-900 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm line-clamp-1">{h.title}</div>
                      <div className="text-xs text-slate-500">{new Date(h.when).toLocaleDateString()}</div>
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{h.price} · Score {h.score}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => setUrl(h.url)} className="btn border text-xs dark:border-slate-700">Use link</button>
                      <button onClick={() => navigator.clipboard.writeText(h.url)} className="btn border text-xs dark:border-slate-700">Copy URL</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} Product Analyzer — MVP
        </div>
      </main>
    </div>
  );
}
