import { describe, expect, it } from '@jest/globals';
import { buildQrSvg, qrFileName, QR_BRAND_COLOR } from '@/lib/qr';

describe('QR code', () => {
  it('builds a branded SVG with a quiet zone from the review URL', () => {
    const svg = buildQrSvg('https://g.page/r/abc123/review')!;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(QR_BRAND_COLOR);
    expect(svg).toContain('viewBox="0 0 ');
    expect(buildQrSvg('https://g.page/r/abc123/review')).toBe(svg); // deterministic
  });
  it('differs for different links', () => {
    expect(buildQrSvg('https://a.example')).not.toBe(buildQrSvg('https://b.example'));
  });
  it('returns null instead of throwing for text that is too long', () => {
    expect(buildQrSvg('x'.repeat(5000))).toBeNull();
  });
  it('makes safe file names', () => {
    expect(qrFileName('Acme & Sons Plumbing!')).toBe('acme-sons-plumbing-review-qr');
    expect(qrFileName('!!!')).toBe('pentriq-review-qr');
  });
});
