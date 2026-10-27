/**
 * QR code for a business's review link. Built from the module matrix so the
 * code can use the brand colour and a quiet zone, and so the same SVG string
 * drives the on-screen preview, the SVG download, the PNG download and print.
 */
import qrcode from 'qrcode-generator';

export const QR_BRAND_COLOR = '#188038';
const QUIET_ZONE = 4; // modules of white border the QR spec requires for reliable scanning

/** Returns a self-contained SVG string, or null if the text cannot be encoded. */
export function buildQrSvg(text: string, opts: { color?: string; background?: string } = {}): string | null {
  const color = opts.color ?? QR_BRAND_COLOR;
  const background = opts.background ?? '#ffffff';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = n + QUIET_ZONE * 2;
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) path += `M${c + QUIET_ZONE},${r + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${background}"/><path d="${path}" fill="${color}"/></svg>`;
  } catch {
    return null; // e.g. text too long for a QR code
  }
}

/** Safe file name for downloads: "Acme Plumbing" -> "acme-plumbing-review-qr". */
export function qrFileName(businessName: string): string {
  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'pentriq'}-review-qr`;
}
