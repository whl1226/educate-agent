export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(s: unknown): string {
  return esc(s);
}

export function jsonText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function nl2br(s: unknown): string {
  return esc(s).replace(/\n/g, '<br/>');
}