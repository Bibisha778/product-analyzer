'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import Link from 'next/link';

type Cam = { deviceId: string; label: string };

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const [cams, setCams] = useState<Cam[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function listCameras() {
    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const options = devices.map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
      setCams(options);
      if (!deviceId && options.length) {
        const back = options.find(c => /back|rear|environment/i.test(c.label));
        setDeviceId((back || options[0]).deviceId);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not list cameras.');
    }
  }

  async function startScan() {
    setError(null);
    setCode(null);
    setLookup(null);
    setScanning(true);

    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();

      // Some browsers won’t reveal device labels until permission granted once.
      if (!cams.length) {
        await navigator.mediaDevices.getUserMedia({ video: true });
        await listCameras();
      }

      const picked = deviceId || cams[0]?.deviceId;
      if (!picked) throw new Error('No camera found');

      // Stop any previous session
      controlsRef.current?.stop();

      const controls = await readerRef.current.decodeFromVideoDevice(
        picked,
        videoRef.current!,
        (result /*, err*/) => {
          if (result?.getText()) {
            setCode(result.getText().trim());
            controlsRef.current?.stop();
            setScanning(false);
          }
        }
      );

      controlsRef.current = controls;
    } catch (e: any) {
      setError(
        location.protocol !== 'https:'
          ? 'Camera requires HTTPS. Deploy to Vercel or use an HTTPS tunnel (e.g., localtunnel).'
          : e?.message || 'Camera error'
      );
      setScanning(false);
    }
  }

  function stopScan() {
    controlsRef.current?.stop();
    setScanning(false);
  }

  useEffect(() => {
    // Attempt to populate camera list (may be empty until permission is granted)
    listCameras();
    return () => controlsRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <div className="mt-3 flex items-center gap-2">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {cams.length === 0 && <option>Detecting cameras…</option>}
                {cams.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
              {!scanning ? (
                <button onClick={startScan} className="rounded bg-slate-900 text-white px-3 py-2 text-sm">
                  Start Scan
                </button>
              ) : (
                <button onClick={stopScan} className="rounded border px-3 py-2 text-sm">
                  Stop
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Tip: iOS/Android require <b>HTTPS</b> for camera. Use Vercel or an HTTPS tunnel.
            </p>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Result</div>
            {code ? (
              <>
                <div className="text-lg font-medium">
                  Code: <span className="font-mono">{code}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={handleLookup}
                    className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm"
                    disabled={loading}
                  >
                    {loading ? 'Looking up…' : 'Lookup Prices'}
                  </button>
                  <a
                    href={`https://www.amazon.com/s?k=${encodeURIComponent(code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    Amazon
                  </a>
                  <a
                    href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    eBay
                  </a>
                  <a
                    href={`https://www.newegg.com/p/pl?d=${encodeURIComponent(code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    Newegg
                  </a>
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(code)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    Google
                  </a>
                </div>
              </>
            ) : (
              <div className="text-slate-500">
                {scanning ? 'Scanning…' : 'Choose camera and tap “Start Scan”, then point at a barcode'}
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {error}
              </div>
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
                            {m.price ? `$${m.price.toFixed(2)}` : '—'} —{' '}
                            <a className="underline" href={m.url} target="_blank" rel="noreferrer">
                              {m.source}
                            </a>
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
