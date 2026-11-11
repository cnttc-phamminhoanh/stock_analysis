import { colorCell } from '../../lib/exportExcel';
import { createPortal } from 'react-dom';
import ExportExcelButton from '../../components/ExportExcelButton';
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';

import type { WipLotItem } from '@shared/api.interface';

import { num, usd } from '../../lib/format';
import type { CauseMeta, LightMeta } from '../../lib/lights';
import { LIGHT_META, WIP_CAUSES, lightOf } from '../../lib/lights';
import { EMPTY_TAG, isBlueLot, tagFor } from './state';
import { dayPillVars } from './styles';
import type { LotTag, LotTagMap, WipChip, WipSort, WipTagPatch } from './types';

type RegisterFilter = 'all' | 'open' | 'red' | 'blue';

interface FilterOption {
  key: RegisterFilter;
  label: string;
}

const PAGE_SIZE = 20;

interface WipRegisterProps {
  exportContainer: HTMLDivElement | null;
  lots: WipLotItem[];
  tags: LotTagMap;
  pending: Record<string, boolean>;
  sort: WipSort;
  chips: WipChip[];
  errorText: string | null;
  focusKey: string;
  onTagChange: (lotId: string, patch: WipTagPatch) => void;
  onChip: (chip: WipChip) => void;
  onClear: () => void;
}

/* 1 2 … 24 — first, last and a short window around the current page */
const buildPageList = (pageCount: number, current: number): (number | 'gap')[] => {
  const out: (number | 'gap')[] = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    if (pageNo === 1 || pageNo === pageCount || (pageNo >= current + 1 && pageNo <= current + 2)) {
      out.push(pageNo);
    } else if (out[out.length - 1] !== 'gap') {
      out.push('gap');
    }
  }
  return out;
};

const WipRegister = ({
  exportContainer,
  lots,
  tags,
  pending,
  sort,
  chips,
  errorText,
  focusKey,
  onTagChange,
  onChip,
  onClear,
}: WipRegisterProps) => {
  const [filter, setFilter] = useState<RegisterFilter>('all');
  const [page, setPage] = useState(0);

  /* a new cross-filter always starts at page 1 */
  useEffect(() => {
    setPage(0);
  }, [focusKey]);

  const tagged: number = lots.filter((lot: WipLotItem) => Boolean(tagFor(tags, lot.id).cause)).length;
  const openCount: number = lots.length - tagged;
  const blueCount: number = lots.filter((lot: WipLotItem) => isBlueLot(tagFor(tags, lot.id))).length;
  const redCount: number = lots.filter((lot: WipLotItem) => {
    const tag: LotTag = tagFor(tags, lot.id);
    return Boolean(tag.cause) && !isBlueLot(tag);
  }).length;

  /* a filter is only offered when it would actually split the list */
  const filters: FilterOption[] = [{ key: 'all', label: `${num(lots.length)} lots` }];
  if (tagged > 0 && openCount > 0) filters.push({ key: 'open', label: `Unclassified ${num(openCount)}` });
  if (redCount > 0) filters.push({ key: 'red', label: `Red ${num(redCount)}` });
  if (blueCount > 0) filters.push({ key: 'blue', label: `Blue flag ${num(blueCount)}` });

  const active: RegisterFilter = filters.some((item: FilterOption) => item.key === filter) ? filter : 'all';

  const view: WipLotItem[] = useMemo(
    () =>
      lots
        .filter((lot: WipLotItem) => {
          const tag: LotTag = tagFor(tags, lot.id);
          if (active === 'open') return !tag.cause;
          if (active === 'blue') return isBlueLot(tag);
          if (active === 'red') return Boolean(tag.cause) && !isBlueLot(tag);
          return true;
        })
        .slice()
        .sort((a: WipLotItem, b: WipLotItem) =>
          sort === 'days' ? b.days - a.days || b.usd - a.usd : b.usd - a.usd || b.days - a.days,
        ),
    [lots, tags, active, sort],
  );

  const pageCount: number = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const current: number = Math.min(page, pageCount - 1);
  const from: number = view.length ? current * PAGE_SIZE + 1 : 0;
  const to: number = Math.min(view.length, current * PAGE_SIZE + PAGE_SIZE);
  const shown: WipLotItem[] = view.slice(current * PAGE_SIZE, to);
  const hidden: boolean = lots.length === 0;

  const handleCause = (
    lot: WipLotItem,
    event: ChangeEvent<HTMLSelectElement>
  ): void => {
    const value = event.target.value;

    const selectedCause = WIP_CAUSES.find(
      (cause: CauseMeta) => cause.key === value
    );

    const reason = selectedCause
      ? `${selectedCause.key}`
      : null;

    onTagChange(lot.id, {
      cause: value || null,
      made_lot: lot.made_lot,
      moNo: lot.moNo,
      goodsNo: lot.goodsNo,
      reason,
    });
  };

  return (
    <div>
      {exportContainer ? createPortal(
        <ExportExcelButton name="WIP Lot Details" disabled={view.length === 0}
          columns={[
            { header: 'Days', numFmt: '0" d"' }, { header: 'Lot date' }, { header: 'MO No.' },
            { header: 'Item', width: 50 }, { header: 'Buyer' }, { header: 'Qty' },
            { header: 'Value', numFmt: '$#,##0' }, { header: 'Cause of red', width: 32 }, { header: 'Blue' },
          ]}
          format={(sheet, rows) => {
            rows.forEach((row, index) => {
              const light = LIGHT_META[lightOf(Number(row[0]))];
              const blue = row[8] === 'Blue';
              if (blue) sheet.getRow(index + 2).eachCell({ includeEmpty: true }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } };
              });
              colorCell(sheet, index + 2, 1, light.color);
              sheet.getCell(index + 2, 1).fill = { type: 'pattern', pattern: 'none' };
              if (blue) colorCell(sheet, index + 2, 9, '#2a6fdb', '#eaf1ff');
              sheet.getRow(index + 2).height = 38;
              const item = sheet.getCell(index + 2, 4);
              const text = String(row[3] ?? '');
              const split = text.indexOf('\n');
              item.value = { richText: [
                { text: split < 0 ? text : text.slice(0, split), font: { name: 'Arial', size: 10, bold: true } },
                ...(split < 0 ? [] : [{ text: text.slice(split), font: { name: 'Arial', size: 10, bold: false, color: { argb: 'FF5D6B7D' } } }]),
              ] };
            });
          }}
          getRows={() => view.map((lot) => {
            const tag = tagFor(tags, lot.id);
            const cause = WIP_CAUSES.find((item) => item.key === tag.cause);
            return [lot.days, lot.lotDate || '—', lot.moNo || '—',
              `${lot.goodsNo}\n${lot.itemName}`, lot.customerName,
              `${num(lot.qty)} ${lot.unit}`.trim(), lot.usd,
              cause ? `${cause.zh} · ${cause.name}` : '—', isBlueLot(tag) ? 'Blue' : '—'];
          })} />
      , exportContainer) : null}
      {chips.length > 0 ? (
        <div className="xfilter" role="status">
          <span className="xfilter-lead">Cross-filter</span>
          {chips.map((chip: WipChip) => (
            <button
              key={chip.key}
              type="button"
              className="xchip"
              title="Remove this filter"
              onClick={() => onChip(chip)}
            >
              <span className="xchip-dim">{chip.dimLabel}</span>
              {chip.label}
              <span className="xchip-x" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
          <button type="button" className="xfilter-clear" onClick={onClear}>
            Clear all
          </button>
        </div>
      ) : null}

      {errorText ? (
        <p className="wip-tag-error" role="alert">
          {errorText}
        </p>
      ) : null}

      {tagged > 0 || blueCount > 0 ? (
        <div className="reg-progress">
          <span>
            <b>{num(tagged)}</b> of {num(lots.length)} red lots classified
          </span>
          <span>
            <b style={{ color: 'var(--blue)' }}>{num(blueCount)}</b> blue-flagged
          </span>
        </div>
      ) : null}

      {filters.length > 1 ? (
        <div className="reg-tools">
          <div className="seg">
            {filters.map((item: FilterOption) => (
              <button
                key={item.key}
                type="button"
                className={active === item.key ? 'on' : undefined}
                aria-pressed={active === item.key}
                onClick={() => {
                  setFilter(item.key);
                  setPage(0);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hidden ? (
        <div className="reg-empty">
          <b>No lots in the register match this cross-filter.</b>
          <span>
            The register lists lots 29+ days on the line, so a shorter-age signal has no rows here. Pick a red-side
            signal, or clear the filter.
          </span>
          <button type="button" className="reg-empty-btn" onClick={onClear}>
            Clear filters
          </button>
        </div>
      ) : null}

      <div className={hidden ? 'reg-wrap is-hidden' : 'reg-wrap'}>
        <table className="reg">
          <thead>
            <tr>
              <th>Days</th>
              <th>Lot date</th>
              <th>MO No.</th>
              <th>Item</th>
              <th>Buyer</th>
              <th className="r">Qty</th>
              <th className="r">Value</th>
              <th>Cause of red</th>
              <th className="c">Blue</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((lot: WipLotItem) => {
              const tag: LotTag = tags[lot.id] ?? EMPTY_TAG;
              const light: LightMeta = LIGHT_META[lightOf(lot.days)] ?? LIGHT_META[3];
              const blue: boolean = isBlueLot(tag);
              const busy: boolean = Boolean(pending[lot.id]);

              return (
                <tr key={lot.id} className={blue ? 'is-blue' : undefined}>
                  <td>
                    <span className="day-pill" style={dayPillVars(light.color, light.tint)}>
                      <i />
                      {lot.days} d
                    </span>
                  </td>
                  <td className="num muted">{lot.lotDate || '—'}</td>
                  <td className="num">{lot.moNo || '—'}</td>
                  <td className="item">
                    <span className="code">{lot.goodsNo}</span>
                    <span className="nm">{lot.itemName}</span>
                  </td>
                  <td>{lot.customerName}</td>
                  <td className="r num">
                    {num(lot.qty)} <span className="muted">{lot.unit}</span>
                  </td>
                  <td className="r num">{usd(lot.usd)}</td>
                  <td>
                    <select
                      className="cause-select"
                      value={tag.cause ?? ''}
                      aria-label={`Cause of red for ${lot.goodsNo}`}
                      aria-busy={busy}
                      disabled={busy}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => handleCause(lot, event)}
                    >
                      <option value="">— select —</option>
                      {WIP_CAUSES.map((cause: CauseMeta) => (
                        <option key={cause.key} value={cause.key}>
                          {cause.zh} · {cause.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="c">
                    <button
                      type="button"
                      className={blue ? 'blue-toggle on' : 'blue-toggle'}
                      aria-pressed={blue}
                      aria-busy={busy}
                      disabled={busy || tag.cause !== 'delay'}
                      aria-label={blue ? `Clear blue flag for ${lot.goodsNo}` : `Mark ${lot.goodsNo} blue`}
                      title={blue ? 'Blue flag set' : 'Mark blue: needs special attention'}
                      onClick={() =>
                        onTagChange(lot.id, {
                          blueFlag: !tag.blueFlag,
                          made_lot: lot.made_lot,
                          moNo: lot.moNo,
                          goodsNo: lot.goodsNo,
                          reason: tag.cause,
                        })
                      }
                    >
                      {blue ? 'Blue' : 'Mark'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={hidden ? 'pager is-hidden' : 'pager'}>
        <span className="pager-info num">
          {num(from)}–{num(to)} of {num(view.length)}
        </span>
        <div className="pager-btns">
          <button
            type="button"
            className="page-btn"
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            aria-label="Previous page"
          >
            ‹
          </button>
          {buildPageList(pageCount, current).map((pageNo: number | 'gap', index: number) =>
            pageNo === 'gap' ? (
              <span className="page-gap" key={`gap-${index}`}>
                …
              </span>
            ) : (
              <button
                key={pageNo}
                type="button"
                className={pageNo === current + 1 ? 'page-btn current' : 'page-btn'}
                aria-current={pageNo === current + 1 ? 'page' : undefined}
                onClick={() => setPage(pageNo - 1)}
              >
                {pageNo}
              </button>
            ),
          )}
          <button
            type="button"
            className="page-btn"
            onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
            disabled={current >= pageCount - 1}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};

export default WipRegister;
