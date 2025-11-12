import { clsx } from 'clsx';

export default function ResultCard({ data }: { data: any }) {
  const price = typeof data?.priceNum === 'number' ? `$${data.priceNum.toFixed(2)}` : data?.price ?? 'N/A';
  const score = typeof data?.profitScore === 'number' ? data.profitScore : (typeof data?.score === 'number' ? data.score : undefined);
  const badge = typeof score === 'number' ? (score >= 25 ? 'badge-green' : 'badge-amber') : 'badge-slate';

  return (
    <div className="card p-5">
      <div className="flex gap-4">
        <img src={data?.image || '/placeholder.png'} alt={data?.title || 'Product'} className="h-28 w-28 object-contain rounded-lg ring-1 ring-slate-200 bg-white" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{data?.title || 'No title found'}</h3>
            <span className={clsx('badge', badge)}>{typeof score === 'number' ? `Score ${score}/100` : 'Score N/A'}</span>
          </div>
          <div className="mt-1 text-sm text-slate-600 truncate">{data?.site || data?.source || 'Unknown source'}</div>
          <div className="mt-3 text-lg font-semibold">{price}</div>
          <div className="mt-3 flex gap-2">
            {data?.originalUrl && (
              <a href={data.originalUrl} target="_blank" rel="noreferrer" className="btn-ghost">Open</a>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(`${data?.title || 'Product'} — ${price} (${data?.site || 'unknown'})`)}
              className="btn-ghost"
              title="Copy short summary"
            >
              Copy summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
