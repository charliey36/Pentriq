'use client';

import { useMemo } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon } from '@/components/ui/icons';
import { APP_NAME } from '@/lib/brand';
import { buildQrSvg, qrFileName } from '@/lib/qr';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QrPanel({ url, businessName, logoUrl }: { url: string; businessName: string; logoUrl: string | null }) {
  const svg = useMemo(() => buildQrSvg(url), [url]);
  const file = qrFileName(businessName);

  if (!svg) {
    return <p className="text-sm text-red-600 dark:text-red-400">This review link is too long to turn into a QR code. Use a shorter link in Settings.</p>;
  }

  function downloadSvg() {
    download(new Blob([svg!], { type: 'image/svg+xml' }), `${file}.svg`);
  }

  function downloadPng() {
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((b) => b && download(b, `${file}.png`), 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg!)}`;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      <style>{`@media print { body * { visibility: hidden; } #qr-print-area, #qr-print-area * { visibility: visible; } #qr-print-area { position: fixed; inset: 0; margin: auto; width: 100%; max-width: 480px; height: fit-content; border: 0 !important; box-shadow: none !important; } }`}</style>

      <div id="qr-print-area" className="mx-auto w-full max-w-sm rounded-3xl border border-line bg-white p-6 text-center shadow-sm">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto mb-3 h-12 w-12 rounded-xl object-cover" />
        )}
        <p className="text-lg font-semibold tracking-tight text-slate-900">{businessName}</p>
        <p className="mt-1 text-sm text-slate-600">Enjoyed your visit? Scan to leave us a review</p>
        <div className="mx-auto mt-4 aspect-square w-full max-w-[280px]" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 text-xs text-slate-500">Takes less than a minute</p>
        <p className="mt-4 text-[11px] font-medium tracking-wide text-slate-400">Powered by <span className="text-slate-700">Pentr</span><span className="text-[#188038]">iq</span></p>
      </div>

      <div className="space-y-6">
        <div>
          <p className="label">Your review link</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-surface-subtle px-3 py-2 ring-1 ring-inset ring-line">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">{url}</code>
            <CopyButton value={url} label="Copy review link" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={downloadPng}><Icon name="upload" className="h-4 w-4 rotate-180" />Download PNG</button>
          <button type="button" className="btn btn-secondary" onClick={downloadSvg}>Download SVG</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print</button>
        </div>

        <div className="rounded-xl bg-surface-subtle p-4 ring-1 ring-inset ring-line">
          <p className="text-sm font-medium text-ink">Where to use it</p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-ink-3">
            <li><b className="text-ink-2">Reception desk:</b> print at A5 or larger in a frame or stand.</li>
            <li><b className="text-ink-2">Invoices and receipts:</b> add the SVG to your template, at least 2.5 cm wide.</li>
            <li><b className="text-ink-2">Business cards:</b> use the SVG at 2 cm or larger on the back.</li>
            <li><b className="text-ink-2">Vehicles:</b> use the SVG on a sticker or magnet at 10 cm or larger, and keep the white border.</li>
          </ul>
          <p className="mt-3 text-xs text-ink-4">Always test the printed code with your phone before printing in bulk. Scans open your review page directly; they are not counted in link-click stats.</p>
        </div>
      </div>
    </div>
  );
}
