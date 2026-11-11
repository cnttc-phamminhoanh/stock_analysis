import { useEffect, useMemo, useState } from 'react';

import type { StockWipSummary, WipLotItem } from '@shared/api.interface';

import { getStockErrorMessage } from '../../../api/stock';
import Card from '../components/Card';
import { useUpdateWipTag, useWipDataset } from '../hooks/useStockData';
import { num, usd } from '../lib/format';
import { LIGHT_META } from '../lib/lights';
import RedByBuyer from './wip/RedByBuyer';
import SortSeg from './wip/SortSeg';
import WipHistogram from './wip/WipHistogram';
import WipLights from './wip/WipLights';
import WipRegister from './wip/WipRegister';
import WipSkeleton from './wip/WipSkeleton';
import {
  EMPTY_FOCUS,
  EMPTY_TAG,
  causeLabel,
  filterLots,
  focusKeyOf,
  normalizeBuyerName,
  seedTags,
  toggleFocus,
} from './wip/state';
import type { LotTag, LotTagMap, WipChip, WipFocus, WipFocusDim, WipSort, WipTagPatch } from './wip/types';
import './wip/wip.css';

const WipView = () => {
  const [exportContainer, setExportContainer] = useState<HTMLDivElement | null>(null);
  const wipQuery = useWipDataset();
  const updateTag = useUpdateWipTag();

  const [focus, setFocus] = useState<WipFocus>(EMPTY_FOCUS);
  const [sort, setSort] = useState<WipSort>('days');
  const [tags, setTags] = useState<LotTagMap>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [tagError, setTagError] = useState<string | null>(null);

  const dataset = wipQuery.data?.data;
  const customers: string[] = useMemo<string[]>(() => (dataset ? dataset.customers : []), [dataset]);
  const lots: WipLotItem[] = useMemo<WipLotItem[]>(
    () =>
      dataset
        ? dataset.lots.map((lot: WipLotItem) => {
          const customerName = normalizeBuyerName(lot.customerName);
          const customerIdx = customers.indexOf(customerName);
          return {
            ...lot,
            customerName,
            customerIdx: customerIdx >= 0 ? customerIdx : lot.customerIdx,
          };
        })
        : [],
    [dataset, customers],
  );
  const summary: StockWipSummary | null = dataset ? dataset.summary : null;

  /* the server is the source of truth for tags: re-seed whenever the query refreshes */
  useEffect(() => {
    setTags(seedTags(lots));
  }, [lots]);

  const focusedLots: WipLotItem[] = useMemo<WipLotItem[]>(
    () => filterLots(lots, tags, focus),
    [lots, tags, focus],
  );

  const chips: WipChip[] = useMemo<WipChip[]>(() => {
    const list: WipChip[] = [];
    if (focus.light !== null) {
      list.push({
        key: 'light',
        dimLabel: 'Signal',
        label: LIGHT_META[focus.light]?.name ?? '',
        value: focus.light,
      });
    }
    if (focus.week !== null) {
      list.push({
        key: 'week',
        dimLabel: 'Time on line',
        label: summary?.weeks[focus.week]?.label ?? '',
        value: focus.week,
      });
    }
    if (focus.cust !== null) {
      list.push({ key: 'cust', dimLabel: 'Buyer', label: customers[focus.cust] ?? '', value: focus.cust });
    }
    if (focus.cause !== null) {
      list.push({ key: 'cause', dimLabel: 'Cause', label: causeLabel(focus.cause), value: focus.cause });
    }
    return list;
  }, [focus, summary, customers]);

  const pick = (dim: WipFocusDim, value: number | string): void => {
    setFocus((previous: WipFocus) => toggleFocus(previous, dim, value));
  };

  const clearFocus = (): void => {
    setFocus(EMPTY_FOCUS);
  };

  const commitTag = (lotId: string, patch: WipTagPatch): void => {
    const previous: LotTag = tags[lotId] ?? EMPTY_TAG;
    const next: LotTag = {
      cause: patch.cause === undefined ? previous.cause : patch.cause,
      blueFlag: patch.blueFlag ?? false,
    };

    setTags((current: LotTagMap) => ({ ...current, [lotId]: next }));
    setPending((current: Record<string, boolean>) => ({ ...current, [lotId]: true }));
    setTagError(null);

    updateTag.mutate(
      {
        lotId,
        cause: next.cause,
        blueFlag: next.blueFlag,
        mark: next.blueFlag,
        made_lot: patch.made_lot,
        moNo: patch.moNo,
        goodsNo: patch.goodsNo,
        reason: patch.reason,
      },
      {
        onError: (error: unknown) => {
          setTags((current: LotTagMap) => ({ ...current, [lotId]: previous }));
          setTagError(getStockErrorMessage(error, 'Could not save this lot tag. Try again.'));
        },
        onSettled: () => {
          setPending((current: Record<string, boolean>) => {
            const copy: Record<string, boolean> = { ...current };
            delete copy[lotId];
            return copy;
          });
        },
      },
    );
  };

  if (wipQuery.isLoading) {
    return (
      <main className="wrap stack">
        <Card zh="在制信号灯" en="WIP Signal Lights">
          <WipSkeleton rows={3} tall />
        </Card>
        <div className="row-2">
          <Card zh="在制时长分布" en="Time on Line">
            <WipSkeleton rows={4} tall />
          </Card>
          <Card zh="红灯按客户" en="Red by Buyer">
            <WipSkeleton rows={5} />
          </Card>
        </div>
        <Card zh="红灯登记表" en="Cross-filtered Register">
          <WipSkeleton rows={7} />
        </Card>
      </main>
    );
  }

  if (wipQuery.isError || !summary) {
    return (
      <main className="wrap stack">
        <Card zh="在制信号灯" en="WIP Signal Lights">
          <div className="empty">
            <h3>WIP dataset unavailable</h3>
            <p>{getStockErrorMessage(wipQuery.error, 'The WIP dataset could not be loaded.')}</p>
            <button
              type="button"
              onClick={() => {
                void wipQuery.refetch();
              }}
              disabled={wipQuery.isFetching}
            >
              {wipQuery.isFetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="wrap stack">
      <Card zh="在制信号灯" en="WIP Signal Lights" note={`${usd(summary.usd)} · ${num(summary.lines)} lots`}>
        <WipLights
          summary={summary}
          lots={lots}
          tags={tags}
          focusLight={focus.light}
          onPick={(value: number) => pick('light', value)}
        />
      </Card>

      <div className="row-2">
        <Card zh="在制时长分布" en="Time on Line" className="wip-chart-card">
          <WipHistogram
            summary={summary}
            focusWeek={focus.week}
            onPick={(value: number) => pick('week', value)}
          />
        </Card>

        <Card zh="红灯按客户" en="Red by Buyer" note={`${usd(summary.redUsd)} in red`} className="red-buyer-card">
          <RedByBuyer
            summary={summary}
            customers={customers}
            focusCust={focus.cust}
            onPick={(value: number) => pick('cust', value)}
          />
        </Card>
      </div>

      <Card
        zh="红灯登记表"
        en="Cross-filtered Register"
        note={chips.length > 0 ? `${num(focusedLots.length)} of ${num(lots.length)} lots match` : undefined}
        headRight={
          <>
            <SortSeg sort={sort} onChange={setSort} />
            <div ref={setExportContainer} />
          </>
        }
      >
        <WipRegister
          exportContainer={exportContainer}
          lots={focusedLots}
          tags={tags}
          pending={pending}
          sort={sort}
          chips={chips}
          errorText={tagError}
          focusKey={focusKeyOf(focus)}
          onTagChange={commitTag}
          onChip={(chip: WipChip) => pick(chip.key, chip.value)}
          onClear={clearFocus}
        />
      </Card>
    </main>
  );
};

export default WipView;
