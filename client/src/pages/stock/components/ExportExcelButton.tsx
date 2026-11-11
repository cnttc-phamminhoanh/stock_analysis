import { useState } from 'react';
import { Download } from 'lucide-react';
import { exportExcel, type ExportColumn, type ExportFormatter, type ExportRow } from '../lib/exportExcel';

interface Props {
  getRows: () => ExportRow[] | Promise<ExportRow[]>;
  name: string;
  columns: ExportColumn[];
  disabled?: boolean;
  format?: ExportFormatter;
}

export default function ExportExcelButton({ getRows, name, columns, disabled, format }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="excel-export">
      <button type="button" className="excel-export-button" disabled={disabled || busy}
        title="Export current filters, up to 10,000 rows across all pages"
        onClick={async () => {
          setBusy(true);
          setError('');
          try { await exportExcel(await getRows(), name, columns, format); }
          catch { setError('Export failed. Please try again.'); }
          finally { setBusy(false); }
        }}>
        <Download size={14} aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
