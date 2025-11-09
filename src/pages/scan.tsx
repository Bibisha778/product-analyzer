'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Link from 'next/link';

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    async function start() {
      setError(null);
      setScanning(true);
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCamera = devices.find(d => /back|rear|environment/i.test(d.label))?.deviceId || devices[0]?.deviceId;
        const controls = await reader.decodeFromVideoDevice(backCamera, videoRef.current!, (result, err) => {
          if (stopped) return;
          if (result?.getText()) {
            const txt = result.getText().trim();
            setCode(txt);
            // Stop immediately when we get a code
            controls?.stop();
            reader.reset();
            setScanning(false);
          }
        });
        return () => {
          stopped = true;
          controls?.stop();
          reader.reset();
        };
      } catch (e: any) {
        setError(e?.message || 'Camera error. Check browser permissions.');
        setScanning(false);
      }
    }

    start();
  }, []);

  async function handleLookup() {
    if (!code) return;
    setLoading(true);
    setLookup(null);
    setError(null);
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upc: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Lookup failed');
      setLookup(data);
    } catch (e: any) {
      setError(e?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900 p-4">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between py-3">
          <h1 className="text-2xl font-semibold">Scan Barcode</h1>
          <Link href="/" className="text-sm underline">Back</Link>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Camera Preview</div>
            <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
            <div className="mt-2 text-xs text-slate-500">Grant camera permission when prompted.</div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Result</div>
            {code ? (
              <>
                <div className="text-lg font-medium">Code: <span className="font-mono">{code}</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={handleLookup} className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-60" disabled={loading}>
                    {loading ? 'Looking up…' : 'Lookup Prices'}
                  </button>
                  <a href={`https://www.amazon.com/s?k=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Amazon search</a>
                  <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">eBay search</a>
                  <a href={`https://www.newegg.com/p/pl?d=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Newegg search</a>
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Google</a>
                </div>
              </>
            ) : (
              <div className="text-slate-500">{scanning ? 'Scanning…' : 'Point camera at a barcode'}</div>
            )}

            {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

            {lookup && (
              <div className="mt-4 space-y-3">
                <div className="text-sm text-slate-600">Lookup Results</div>
                <div className="rounded-lg border p-3">
                  <div><b>Product:</b> {lookup.title || '—'}</div>
                  <div><b>Brand:</b> {lookup.brand || '—'}</div>
                  <div><b>Lowest Price:</b> {lookup.lowestPrice ?? 'N/A'}</div>
                  {Array.isArray(lookup.matches) && lookup.matches.length > 0 && (
                    <div className="mt-2">
                      <div className="text-sm font-medium">Matches:</div>
                      <ul className="list-disc ml-5 text-sm">
                        {lookup.matches.map((m: any, i: number) => (
                          <li key={i}>
                            {m.price ? `$${m.price.toFixed(2)}` : '—'} — <a className="underline" href={m.url} target="_blank" rel="noreferrer">{m.source}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
