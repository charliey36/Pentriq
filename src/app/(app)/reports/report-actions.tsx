'use client';

import { Icon } from '@/components/ui/icons';

/** Print / save-as-PDF and CSV download for the executive report. The CSV is built on the server. */
export function ReportActions({ csv, filename }: { csv: string; filename: string }) {
  function download() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={download} className="btn btn-secondary btn-sm">
        <Icon name="download" className="h-4 w-4" />
        CSV
      </button>
      <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
        <Icon name="printer" className="h-4 w-4" />
        Print or save PDF
      </button>
    </div>
  );
}
