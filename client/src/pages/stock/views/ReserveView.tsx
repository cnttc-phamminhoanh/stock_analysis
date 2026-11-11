import { useMemo, useState } from 'react';

import type { ReserveDataset, ReserveRegisterLine } from '@shared/api.interface';

import { getStockErrorMessage } from '../../../api/stock';
import Card from '../components/Card';
import Icon from '../components/Icon';
import { useReserveDataset } from '../hooks/useStockData';
import { num, usd } from '../lib/format';
import ReserveByBuyer from './reserve/ReserveByBuyer';
import ReserveHistogram from './reserve/ReserveHistogram';
import ReserveRegister from './reserve/ReserveRegister';
import ReserveSignals from './reserve/ReserveSignals';
import ReserveSkeleton from './reserve/ReserveSkeleton';
import {
  EMPTY_FOCUS,
  buildBalance,
  buildChips,
  filterReserveRows,
  focusKeyOf,
  toggleFocus,
} from './reserve/focus';
import type { ReserveBalance, ReserveChip, ReserveDim, ReserveFocus } from './reserve/focus';

const ReserveView = () => {
  const [exportContainer, setExportContainer] = useState<HTMLDivElement | null>(null);
  const { data, isLoading, error, refetch } = useReserveDataset();
  const [focus, setFocus] = useState<ReserveFocus>(EMPTY_FOCUS);

  const dataset: ReserveDataset | null = data ? data.data : null;

  const rows = useMemo<ReserveRegisterLine[]>(
    () => (dataset ? filterReserveRows(dataset, focus) : []),
    [dataset, focus],
  );
  const chips = useMemo<ReserveChip[]>(() => (dataset ? buildChips(dataset, focus) : []), [dataset, focus]);
  const balance = useMemo<ReserveBalance | null>(
    () => (dataset ? buildBalance(dataset, focus, rows) : null),
    [dataset, focus, rows],
  );
  const focusKey = useMemo<string>(() => focusKeyOf(chips), [chips]);

  const pick = (dim: ReserveDim, value: number | string) =>
    setFocus((prev: ReserveFocus) => toggleFocus(prev, dim, value));
  const clearFocus = () => setFocus(EMPTY_FOCUS);

  if (isLoading || (!dataset && !error)) {
    return (
      <main className="wrap stack">
        <Card
          zh="保留仓库龄信号"
          en="Reserve Age Signals"
          note="Loading…"
          sub="Reading the reserve warehouse dataset"
        >
          <ReserveSkeleton variant="tiles" />
        </Card>
        <div className="row-wip">
          <Card zh="库龄分布" en="Age Band Distribution" note="Loading…">
            <ReserveSkeleton variant="bars" />
          </Card>
          <Card zh="六个月以上按客户" en="Old Stock by Buyer" note="Loading…" className="stack-card">
            <ReserveSkeleton variant="list" />
          </Card>
        </div>
        <Card zh="保留仓明细" en="Cross-filtered Register" note="Loading…">
          <ReserveSkeleton variant="rows" />
        </Card>
      </main>
    );
  }

  if (!dataset) {
    return (
      <main className="wrap stack">
        <Card zh="保留仓库龄信号" en="Reserve Age Signals" note="Reserve dataset">
          <div className="reg-empty">
            <b className="reserve-error-title">
              <Icon name="alert" size={14} /> Could not load the reserve dataset
            </b>
            <span>{getStockErrorMessage(error, 'The reserve dataset is unavailable right now.')}</span>
            <button
              type="button"
              className="reg-empty-btn"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="wrap stack">
      <Card
        zh="保留仓库龄信号"
        en="Reserve Age Signals"
        note={`${usd(dataset.usd)} · ${num(dataset.lines)} lots · BI warning colours`}
      >
        <ReserveSignals dataset={dataset} focus={focus} onPick={pick} />
      </Card>

      <div className="row-wip">
        <Card
          zh="库龄分布"
          en="Age Band Distribution"
          note={`${usd(dataset.atRiskUsd)} at or past 6 months`}
        >
          <ReserveHistogram dataset={dataset} focus={focus} onPick={pick} />
        </Card>

        <div className="reserve-buyer-slot">
          <Card
            zh="六个月以上按客户"
            en="Old Stock by Buyer"
            note={`${usd(dataset.atRiskUsd)} at or past 6 months`}
            className="stack-card reserve-buyer-card"
          >
            <ReserveByBuyer
              dataset={dataset}
              focus={focus}
              onPick={pick}
            />
          </Card>
        </div>
      </div>

      <Card
        zh="保留仓明细"
        en="Cross-filtered Register"
        headRight={<div ref={setExportContainer} />}
      >
        <ReserveRegister
          exportContainer={exportContainer}
          dataset={dataset}
          rows={rows}
          chips={chips}
          balance={balance}
          focusKey={focusKey}
          onRemoveChip={(chip: ReserveChip) => pick(chip.dim, chip.value)}
          onClear={clearFocus}
        />
      </Card>
    </main>
  );
};

export default ReserveView;
