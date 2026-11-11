import { createPortal } from 'react-dom';
import ExportExcelButton from '../../components/ExportExcelButton';
import { EXPORT_LIMIT, type ExportRow } from '../../lib/exportExcel';
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";

import type { OverviewMeta } from "@shared/api.interface";

import { num } from "../../lib/format";
import type { MonthAxis, PivotCell, PivotStore } from "../../lib/model";
import { storeLabel } from "../../lib/store";

const PAGE_SIZES = [10, 20, 50, 100];

interface FlatRow {
  wh: number;
  cat: number;
  cust: number;
  cells: PivotCell[];
  qty: number;
  usd: number;
}

interface LedgerCellSelection {
  wh: number;
  cat: number;
  cust: number;
  month: string;
}

interface PivotTableProps {
  exportContainer: HTMLDivElement | null;
  stores: PivotStore[];
  meta: OverviewMeta;
  axis: MonthAxis;
  span: number;
  available?: boolean;
  wh: number;
  cat: number;
  cust: number;
  onWh: (idx: number) => void;
  onLedgerCategory: (wh: number, cat: number) => void;
  onLedgerBuyer: (wh: number, cat: number, cust: number) => void;
  onLedgerMonth: (month: string) => void;
  onLedgerCell: (selection: LedgerCellSelection) => void;
  ledgerSelection?: {
    warehouse?: string;
    category?: string;
    buyer?: string;
    month?: string;
  };
  activeMonth?: string;
}

const pageNumbers = (pages: number, current: number): (number | string)[] => {
  const out: (number | string)[] = [];
  if (pages <= 7) {
    for (let page = 1; page <= pages; page += 1) out.push(page);
    return out;
  }
  if (current <= 5) {
    [1, 2, 3, 4, 5].forEach((page: number) => out.push(page));
    out.push("…", pages);
    return out;
  }
  if (current >= pages - 4) {
    out.push(1, "…");
    for (let page = pages - 4; page <= pages; page += 1) out.push(page);
    return out;
  }
  out.push(1, "…", current - 1, current, current + 1, "…", pages);
  return out;
};

const cellKeys =
  (pick: () => void) =>
  (event: KeyboardEvent<HTMLTableCellElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick();
    }
  };

const PivotTable = ({
  exportContainer,
  stores,
  meta,
  axis,
  span,
  available = true,
  wh,
  onWh,
  onLedgerCategory,
  onLedgerBuyer,
  onLedgerMonth,
  onLedgerCell,
  ledgerSelection,
  activeMonth,
}: PivotTableProps) => {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [gotoPage, setGotoPage] = useState("");

  const months: string[] = axis.labels;
  const shownMonths = useMemo(() => {
    const newestFirst = months.slice().reverse();
    return span > 0 ? newestFirst.slice(0, span) : newestFirst;
  }, [months, span]);
  /* pivot cells are stored oldest-first; month columns render newest-first */
  const at = (cells: PivotCell[], j: number): PivotCell =>
    cells[months.length - 1 - j];

  const flat = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    stores.forEach((store: PivotStore) => {
      store.cats.forEach((category) => {
        category.buyers.forEach((buyer) => {
          out.push({
            wh: store.idx,
            cat: category.idx,
            cust: buyer.idx,
            cells: buyer.cells,
            qty: buyer.qty,
            usd: buyer.usd,
          });
        });
      });
    });
    return out;
  }, [stores]);

  const pages = Math.max(1, Math.ceil(flat.length / pageSize));
  const safe = Math.min(page, pages - 1);
  const start = safe * pageSize;
  const slice = flat.slice(start, start + pageSize);

  const spans = slice.map((row: FlatRow, index: number) => {
    const prev = index > 0 ? slice[index - 1] : null;
    const whStart = !prev || prev.wh !== row.wh;
    const catStart = whStart || prev.cat !== row.cat;
    let whSpan = 0;
    let catSpan = 0;
    if (whStart) {
      whSpan = 1;
      while (
        index + whSpan < slice.length &&
        slice[index + whSpan].wh === row.wh
      )
        whSpan += 1;
    }
    if (catStart) {
      catSpan = 1;
      while (
        index + catSpan < slice.length &&
        slice[index + catSpan].wh === row.wh &&
        slice[index + catSpan].cat === row.cat
      ) {
        catSpan += 1;
      }
    }
    return { wh: whSpan, cat: catSpan };
  });

  const totals = shownMonths.map((_label: string, j: number) =>
    flat.reduce(
      (acc, row: FlatRow) => {
        const cell = at(row.cells, j);
        acc.qty =
          acc.qty == null || cell.qty == null ? null : acc.qty + cell.qty;
        acc.usd =
          acc.usd == null || cell.usd == null ? null : acc.usd + cell.usd;
        return acc;
      },
      { qty: 0, usd: 0 },
    ),
  );
  const grandQty = flat.reduce(
    (sum: number, row: FlatRow) =>
      sum == null || row.qty == null ? null : sum + row.qty,
    0,
  );
  const grandUsd = flat.reduce(
    (sum: number, row: FlatRow) =>
      sum == null || row.usd == null ? null : sum + row.usd,
    0,
  );

  useEffect(() => {
    setPage(0);
  }, [span, pageSize]);

  const jump = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = parseInt(gotoPage, 10);
    if (!isNaN(target)) setPage(Math.max(0, Math.min(pages - 1, target - 1)));
    setGotoPage("");
  };

  return (
    <div className="pivot-block">
      {exportContainer ? createPortal(
        <ExportExcelButton
          name="Month Warehouse Ledger"
          disabled={!available || flat.length === 0}
          columns={[
            { header: 'Warehouse 仓库', width: 36 },
            { header: 'Category 类别' },
            { header: 'Buyer 客户' },
            ...shownMonths.flatMap((month) => [
              { header: `${month} Qty`, numFmt: '#,##0' },
              { header: `${month} USD`, numFmt: '#,##0' },
            ]),
            { header: 'Total Qty', numFmt: '#,##0' },
            { header: 'Total USD', numFmt: '#,##0' },
          ]}
          format={(sheet, rows) => {
            const count = shownMonths.length;
            sheet.spliceRows(1, 0, []);
            for (let col = 1; col <= 3; col += 1) {
              sheet.getCell(1, col).value = sheet.getCell(2, col).value;
              sheet.mergeCells(1, col, 2, col);
            }
            [...shownMonths, 'Total'].forEach((month, index) => {
              const col = 4 + index * 2;
              sheet.getCell(1, col).value = month;
              sheet.mergeCells(1, col, 1, col + 1);
              sheet.getCell(2, col).value = 'Qty';
              sheet.getCell(2, col + 1).value = 'USD';
            });
            for (let row = 1; row <= 2; row += 1) {
              sheet.getRow(row).height = 26;
              for (let col = 1; col <= 5 + count * 2; col += 1) {
                const cell = sheet.getCell(row, col);
                if (cell.isMerged && cell.master.address !== cell.address) continue;
                cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF333E4E' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row === 1 ? 'FFEEF0F4' : 'FFF5F6F8' } };
                cell.alignment = { horizontal: col > 3 ? 'center' : 'left', vertical: 'middle' };
              }
            }
            // Merge consecutive warehouses and categories using their original identities.
            const source = flat.slice(0, rows.length - 1);
            for (const col of [1, 2]) {
              let start = 0;
              while (start < source.length) {
                let end = start + 1;
                while (end < source.length && source[end].wh === source[start].wh &&
                  (col === 1 || source[end].cat === source[start].cat)) end += 1;
                if (end - start > 1) sheet.mergeCells(start + 3, col, end + 2, col);
                start = end;
              }
            }
            for (let row = 3; row <= sheet.rowCount; row += 1) {
              for (let col = 4; col <= 5 + count * 2; col += 1) {
                const cell = sheet.getCell(row, col);
                cell.numFmt = '#,##0;-#,##0;"\u2013"';
                if (cell.value == null || cell.value === '') cell.value = '\u2013';
                if (col % 2 === 1) cell.font = { ...cell.font, color: { argb: 'FF5D6B7D' } };
              }
            }
            const total = sheet.lastRow!;
            total.height = 30;
            total.eachCell({ includeEmpty: true }, (cell) => {
              cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1B2432' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1F9' } };
            });
            sheet.mergeCells(total.number, 2, total.number, 3);
            sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
          }}
          getRows={() => {
            // Reserve one row for totals, calculated only from the exported rows.
            const rows: ExportRow[] = flat.slice(0, EXPORT_LIMIT - 1).map((row) => {
              const warehouse = storeLabel(meta.warehouses[row.wh]);
              return [
                [warehouse.primary, warehouse.secondary].filter(Boolean).join(' - '),
                meta.categories[row.cat]?.nameZh ?? '',
                meta.customers[row.cust] ?? '',
                ...shownMonths.flatMap((_month, j) => {
                  const cell = at(row.cells, j);
                  return [cell.qty ?? null, cell.usd ?? null];
                }),
                row.qty, row.usd,
              ];
            });
            const total: ExportRow = ['Total 合计', null, null];
            for (let col = 3; col < 5 + shownMonths.length * 2; col += 1) {
              let sum: number | null = 0;
              for (const row of rows) {
                const value = row[col];
                if (typeof value !== 'number') { sum = null; break; }
                sum += value;
              }
              total.push(sum);
            }
            return [...rows, total];
          }}
        />, exportContainer,
      ) : null}

      <div className="table-scroll">
        <table className="pivot">
          <thead>
            <tr className="groups">
              <th className="corner c-wh" rowSpan={2}>
                Warehouse 仓库
              </th>
              <th className="corner" rowSpan={2}>
                Category 类别
              </th>
              <th className="corner" rowSpan={2}>
                Buyer 客户
              </th>
              {shownMonths.map((label: string) => {
                const monthActive = activeMonth === label;
                return (
                  <th
                    key={label}
                    className={`grp month${label.slice(5) === "01" ? " yr-start" : ""}${monthActive ? " is-active" : ""}`}
                    colSpan={2}
                    title={`Click để lọc theo tháng ${label}`}
                  >
                    <button
                      type="button"
                      className="ledger-month-btn"
                      aria-pressed={monthActive}
                      onClick={() => onLedgerMonth(label)}
                    >
                      {label}
                    </button>
                  </th>
                );
              })}
              <th className="grp" colSpan={2}>
                Total
              </th>
            </tr>
            <tr className="subs">
              {shownMonths.map((label: string) => (
                <Fragment key={label}>
                  <th className="sub">Qty</th>
                  <th className="sub">USD</th>
                </Fragment>
              ))}
              <th className="sub">Qty</th>
              <th className="sub">USD</th>
            </tr>
          </thead>
          <tbody>
            {!available ? (
              <tr>
                <td colSpan={3}>—</td>
                <td className="cell">—</td>
                <td className="cell usd">—</td>
              </tr>
            ) : null}
            {slice.map((row: FlatRow, index: number) => {
              const whLabel = storeLabel(meta.warehouses[row.wh]);
              return (
                <tr key={`${row.wh}|${row.cat}|${row.cust}`}>
                  {spans[index].wh ? (
                    <td
                      className="rowh wcell"
                      rowSpan={spans[index].wh}
                      role="button"
                      tabIndex={0}
                      aria-pressed={wh === row.wh}
                      onClick={() => onWh(wh === row.wh ? -1 : row.wh)}
                      onKeyDown={cellKeys(() =>
                        onWh(wh === row.wh ? -1 : row.wh),
                      )}
                    >
                      {whLabel.primary}
                      {whLabel.secondary ? (
                        <span className="wh-2">{whLabel.secondary}</span>
                      ) : null}
                    </td>
                  ) : null}
                  {spans[index].cat ? (
                    <td
                      className="rowh cat-cell"
                      rowSpan={spans[index].cat}
                      role="button"
                      tabIndex={0}
                      aria-pressed={
                        ledgerSelection?.category ===
                          meta.categories[row.cat]?.nameZh &&
                        ledgerSelection?.warehouse ===
                          meta.warehouses[row.wh]?.nameZh &&
                        !ledgerSelection?.buyer &&
                        !ledgerSelection?.month
                      }
                      onClick={() => onLedgerCategory(row.wh, row.cat)}
                      onKeyDown={cellKeys(() =>
                        onLedgerCategory(row.wh, row.cat),
                      )}
                    >
                      {meta.categories[row.cat]?.nameZh ?? ""}
                    </td>
                  ) : null}
                  <td
                    className="buyer-cell"
                    role="button"
                    tabIndex={0}
                    aria-pressed={
                      ledgerSelection?.buyer === meta.customers[row.cust] &&
                      ledgerSelection?.category ===
                        meta.categories[row.cat]?.nameZh &&
                      ledgerSelection?.warehouse ===
                        meta.warehouses[row.wh]?.nameZh &&
                      !ledgerSelection?.month
                    }
                    onClick={() => onLedgerBuyer(row.wh, row.cat, row.cust)}
                    onKeyDown={cellKeys(() =>
                      onLedgerBuyer(row.wh, row.cat, row.cust),
                    )}
                  >
                    {meta.customers[row.cust] ?? ""}
                  </td>
                  {shownMonths.map((label: string, j: number) => {
                    const cell = at(row.cells, j);

                    const selectCell = (): void => {
                      onLedgerCell({
                        wh: row.wh,
                        cat: row.cat,
                        cust: row.cust,
                        month: label,
                      });
                    };

                    const isSelected =
                      ledgerSelection?.month === label &&
                      ledgerSelection?.buyer === meta.customers[row.cust] &&
                      ledgerSelection?.category ===
                        meta.categories[row.cat]?.nameZh &&
                      ledgerSelection?.warehouse ===
                        meta.warehouses[row.wh]?.nameZh;
                    const sel = isSelected ? " is-selected" : "";

                    return (
                      <Fragment key={label}>
                        <td
                          className={`${cell.qty ? "cell ledger-cell" : "cell empty"}${sel}`}
                          {...(cell.qty
                            ? {
                                role: "button",
                                tabIndex: 0,
                                onClick: selectCell,
                                onKeyDown: cellKeys(selectCell),
                                title: `Lọc chi tiết Qty tháng ${label}`,
                              }
                            : {})}
                        >
                          {cell.qty ? num(cell.qty) : "–"}
                        </td>
                        <td
                          className={`${cell.usd ? "cell usd ledger-cell" : "cell usd empty"}${sel}`}
                          {...(cell.usd
                            ? {
                                role: "button",
                                tabIndex: 0,
                                onClick: selectCell,
                                onKeyDown: cellKeys(selectCell),
                                title: `Lọc chi tiết USD tháng ${label}`,
                              }
                            : {})}
                        >
                          {cell.usd ? num(cell.usd) : "–"}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="cell">{num(row.qty)}</td>
                  <td className="cell usd">{num(row.usd)}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td colSpan={1}>Total 合计</td>
              <td colSpan={2} />
              {totals.map((total, j: number) => (
                <Fragment key={shownMonths[j]}>
                  <td className="cell">{num(total.qty)}</td>
                  <td className="cell usd">{num(total.usd)}</td>
                </Fragment>
              ))}
              <td className="cell">{num(available ? grandQty : null)}</td>
              <td className="cell usd">{num(available ? grandUsd : null)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sheet-foot">
        <span className="foot-total">
          Total: <b>{num(available ? flat.length : null)}</b>
        </span>
        <div className="foot-right">
          <div className="pager-btns">
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.max(0, safe - 1))}
              disabled={safe === 0}
              aria-label="Previous page"
            >
              ‹
            </button>
            {pageNumbers(pages, safe + 1).map(
              (entry: number | string, index: number) =>
                typeof entry === "string" ? (
                  <span className="page-gap" key={`gap${index}`}>
                    {entry}
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={`page-btn${entry === safe + 1 ? " current" : ""}`}
                    onClick={() => setPage(entry - 1)}
                    aria-current={entry === safe + 1 ? "page" : undefined}
                  >
                    {entry}
                  </button>
                ),
            )}
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.min(pages - 1, safe + 1))}
              disabled={safe >= pages - 1}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
          <select
            className="foot-size"
            value={pageSize}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size: number) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <form className="foot-goto" onSubmit={jump}>
            <span>Go to</span>
            <input
              value={gotoPage}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setGotoPage(event.target.value.replace(/[^0-9]/g, ""))
              }
              inputMode="numeric"
              aria-label="Page number"
            />
            <span>Page</span>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PivotTable;
