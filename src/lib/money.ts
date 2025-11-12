export function parseNumberLike(s: string): number {
  const cleaned = (s || '').replace(/[^\d.,-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) return parseFloat(cleaned.replace(/,/g, ''));
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) return parseFloat(cleaned.replace(',', '.'));
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  return parseFloat(cleaned);
}

export function firstMoneyUniversal(text: string) {
  const re = /(USD|CAD|GBP|EUR|\$|£|€)?\s*([0-9][0-9.,-]{0,10})/i;
  const m = (text || '').match(re);
  if (!m) return NaN;
  return parseNumberLike(m[2]);
}

export function collectAllMoneyUniversal(text: string): number[] {
  const out: number[] = [];
  const re = /(USD|CAD|GBP|EUR|\$|£|€)?\s*([0-9][0-9.,-]{0,10})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || '')) !== null) {
    const val = parseNumberLike(m[2] || '');
    if (Number.isFinite(val)) out.push(val);
  }
  return out;
}
