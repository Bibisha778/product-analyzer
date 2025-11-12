import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Spinner from '../components/Spinner';
import ResultCard from '../components/ResultCard';

type Result = {
  title?: string;
  price?: string;
  priceNum?: number;
  profitScore?: number;
  score?: number;
  image?: string;
  site?: string;
  source?: string;
};

function saveRecent(entry: any) {
  try {
    const k = 'pa_recent';
    const arr = JSON.parse(localStorage.getItem(k) || '[]');
    arr.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(k, JSON.stringify(arr.slice(0, 8)));
  } catch {}
}

function getRecent(): any[] {
  try { return JSON.parse(localStorage.getItem('pa_recent') || '[]'); } catch { return []; }
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => setRecent(getRecent()), []);

  const analyze = async () => {
    if (!/^https?:\/\//i.test(url)) { toast.error('Enter a valid product URL'); return; }
    setLoading(true); setResult(null);
    try {
      const r = await fetch('/api/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Failed to analyze');
      const payload = { ...data, originalUrl: url };
      setResult(payload);
      saveRecent({ title: data?.title, price: data?.price ?? data?.priceNum, site: data?.site, image: data?.image, originalUrl: url });
      setRecent(getRecent());
    } catch (e:any) {
      toast.error(e?.message || 'Analyze failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <section className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Analyze a product in seconds</h1>
        <p className="mt-3 text-slate-600">Paste a link from Walmart, Indigo, eBay, BookOutlet, or Newegg. We’ll pull the title, price, image, and a quick profit score.</p>
      </section>

      <div className="card p-5">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="https://store.com/product"
            value={url}
            onChange={(e)=>setUrl(e.target.value)}
            onKeyDown={(e)=> e.key === 'Enter' && analyze()}
          />
          <button onClick={analyze} disabled={loading} className="btn-primary">
            {loading ? (<><Spinner /> <span className="ml-2">Analyzing</span></>) : 'Analyze'}
          </button>
        </div>
        <div className="mt-3 text-xs text-slate-500">Tip: use a direct product page. JS-heavy or paywalled pages may return partial data.</div>
      </div>

      {result && <div className="mt-8"><ResultCard data={result} /></div>}

      {recent.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent</h2>
            <button
              onClick={() => { localStorage.removeItem('pa_recent'); setRecent([]); }}
              className="text-sm text-slate-500 hover:text-slate-700"
            >Clear</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {recent.map((r, i) => (
              <ResultCard key={i} data={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
