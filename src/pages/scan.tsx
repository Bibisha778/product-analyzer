import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException, Result } from '@zxing/library';

type Lookup = {
  code?: string;
  bestPrice?: number;
  samplePrices?: number[];
  note?: string;
  error?: string;
};

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');

  // Start camera & continuous decode
  const startScan = async () => {
    if (scanning) return;
    setLookup(null);
    setCode('');
    setScanning(true);

    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      let active = true;
      const tick = async () => {
        if (!active || !videoRef.current) return;

        try {
          const result: Result | undefined = await reader.decodeFromVideoElement(videoRef.current);
          if (result && result.getText()) {
            setCode(result.getText().trim());
            await stopScan(); // stop as soon as we read a code
            void doLookup(result.getText().trim());
            return;
          }
        } catch (err) {
          if (!(err instanceof NotFoundException)) {
            // ignore non-found errors; continue scanning
          }
        }

        if (active) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      stopRef.current = async () => {
        active = false;
        try { readerRef.current?.reset(); } catch {}
        if (videoRef.current && videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          videoRef.current.srcObject = null;
        }
        setScanning(false);
      };
    } catch (e) {
      console.error(e);
      setScanning(false);
      alert('Camera not available. Try manual input below.');
    }
  };

  const stopScan = async () => {
    if (stopRef.current) await stopRef.current();
  };

  const doLookup = async (c: string) => {
    setBusy(true);
    setLookup(null);
    try {
      const r = await fetch('/api/upc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Lookup failed');
      setLookup(data);
    } catch (e: any) {
      setLookup({ code: c, error: e?.message || 'Lookup failed' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    return () => { stopScan(); };
  }, []);

  return (
    <div className="container-pro py-8">
      <h1 className="text-2xl font-bold mb-4">Scan a Barcode</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-4">
          <video ref={videoRef} className="w-full rounded-lg bg-black aspect-video" muted playsInline />
          <div className="mt-3 flex gap-2">
            {!scanning ? (
              <button onClick={startScan} className="btn-primary">Start Camera</button>
            ) : (
              <button onClick={stopScan} className="btn-ghost">Stop</button>
            )}
            {code && <span className="badge badge-slate">Last code: {code}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-2">Tip: hold the barcode ~10–20 cm from the camera with good light.</p>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold mb-2">Or enter code manually</h2>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="UPC/EAN (e.g. 9780735211292)"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e)=> e.key==='Enter' && manual.trim() && doLookup(manual.trim())}
            />
            <button onClick={()=> manual.trim() && doLookup(manual.trim())} className="btn-primary">Lookup</button>
          </div>

          <div className="mt-5">
            {busy && <div className="skeleton h-6 w-40 mb-2"></div>}
            {lookup && (
              <div className="rounded-lg border p-4 bg-gray-50">
                <div className="text-sm text-slate-600 mb-1">Code</div>
                <div className="font-mono">{lookup.code}</div>
                <div className="mt-3 text-sm text-slate-600 mb-1">Best price found</div>
                <div className="text-xl font-bold">
                  {typeof lookup.bestPrice === 'number' ? `$${lookup.bestPrice.toFixed(2)}` : 'N/A'}
                </div>
                {lookup.samplePrices?.length ? (
                  <div className="mt-3 text-sm">
                    <div className="text-slate-600 mb-1">Sample prices</div>
                    <div className="flex flex-wrap gap-2">
                      {lookup.samplePrices.slice(0,6).map((p, i) => (
                        <span key={i} className="badge badge-slate">${p.toFixed(2)}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {lookup.error && <div className="text-red-600 mt-3 text-sm">{lookup.error}</div>}
                {lookup.note && <div className="text-slate-500 mt-3 text-xs">{lookup.note}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
