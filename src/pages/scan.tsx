'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export default function ScanPage() {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const containerId = 'html5-qrcode-scanner';
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);

    // On desktop, localhost is secure; no HTTPS required.
    const scanner = new Html5QrcodeScanner(
      containerId,
      {
        fps: 10,
        qrbox: { width: 300, height: 200 },
        rememberLastUsedCamera: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        // Desktop webcams are usually "user" facing; html5-qrcode shows a camera dropdown anyway.
        // It will prompt for permission automatically.
      },
      /* verbose= */ false
    );

    scannerRef.current = scanner;

    scanner.render(
      (text) => {
        setCode(text.trim());
        scanner.clear().catch(() => {});
      },
      (err) => {
        // Frequent decode errors are normal; only surface permission/init problems
        if (typeof err === 'string' && /NotAllowedError|NotReadableError|Permission|device|NotFoundError/i.test(err)) {
          setError(err);
        }
      }
    );

    return () => {
      scanner.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, []);

  async function handleLookup() {
    if (!code) return;
    setLoading(true); setLookup(null); setError(null);
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
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between py-3">
          <h1 className="text-2xl font-semibold">Scan Barcode (Desktop)</h1>
          <Link href="/" className="text-sm underline">Back</Link>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Scanner box (html5-qrcode renders its own UI here) */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Camera Scanner</div>
            <div id={containerId} className="rounded overflow-hidden" />
            <p className="mt-2 text-xs text-slate-500">
              If the camera is blocked, click the 🔒 icon in your browser’s address bar → <b>Site settings</b> → set <b>Camera: Allow</b>, then reload.
            </p>
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* Result & actions */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Result</div>
            {code ? (
              <>
                <div className="text-lg font-medium">
                  Code: <span className="font-mono">{code}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={handleLookup} className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm" disabled={loading}>
                    {loading ? 'Looking up…' : 'Lookup Prices'}
                  </button>
                  <a href={`https://www.amazon.com/s?k=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Amazon</a>
                  <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">eBay</a>
                  <a href={`https://www.newegg.com/p/pl?d=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Newegg</a>
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(code)}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm">Google</a>
                </div>
              </>
            ) : (
              <div className="text-slate-500">Allow camera access, then hold a barcode in front of your MacBook camera.</div>
            )}

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
