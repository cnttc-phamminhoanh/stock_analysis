import { useMemo, useState } from "react";

import { getStockErrorMessage } from "../../../api/stock";
import BarChart from "../components/BarChart";
import Card from "../components/Card";
import {
  useStockOverview,
  useWipDataset,
  useReserveDataset,
} from "../hooks/useStockData";
import { pct, usd } from "../lib/format";
import type { StockFilters } from "../lib/model";
import { useViewOptions } from "../StockLayout";
import DetailTable from "./overview/DetailTable";
import PivotTable from "./overview/PivotTable";
import RankList from "./overview/RankList";
import StoreKpis from "./overview/StoreKpis";
// [ĐỔI] bỏ buildOverviewModel, chỉ còn buildSummaryOverviewModel
import { buildSummaryOverviewModel } from "./overview/model";
import type { OverviewScope, ScopeDimension } from "./overview/scope";

interface MonthSpanOption {
  span: number;
  label: string;
}

const MONTH_SPANS: MonthSpanOption[] = [
  { span: 6, label: "6 months" },
  { span: 12, label: "12 months" },
  { span: 0, label: "All months" },
];

// [MỚI] lưu lựa chọn theo TÊN thay vì idx
interface Selection {
  wh?: string;
  cat?: string;
  cust?: string;
  year?: string;
}

interface LedgerSel {
  warehouse?: string;
  category?: string;
  buyer?: string;
  month?: string;
}

const OverviewSkeleton = () => (
  <main className="wrap stack" aria-busy="true">
    <div className="row-2">
      <Card zh="年度汇总" en="Annual Summary">
        <p className="card-sub">Loading the stock cube…</p>
      </Card>
      <Card zh="类别汇总" en="Category Summary">
        <p className="card-sub">Loading the stock cube…</p>
      </Card>
    </div>
    <Card zh="仓库金额" en="Warehouse Summary">
      <p className="card-sub">Loading warehouse totals…</p>
    </Card>
    <div className="row-2">
      <Card zh="客户排行" en="Buyer Rank">
        <p className="card-sub">Loading buyer totals…</p>
      </Card>
      <Card zh="库龄排行" en="Aged Rank">
        <p className="card-sub">Loading aged totals…</p>
      </Card>
    </div>
    <Card zh="月份明细" en="Month × Warehouse Ledger">
      <p className="card-sub">Loading the month ledger…</p>
    </Card>
    <Card zh="库存明细" en="Stock Detail">
      <p className="card-sub">Loading stock lines…</p>
    </Card>
  </main>
);

const BAND_INDEX: Record<string, number> = {
  "< 3 months": 0,
  "3–6 months": 1,
  "6–9 months": 2,
  "9–12 months": 3,
  "12+ months": 4,
};

interface ReserveRowRaw {
  ageMonths: number | null;
  ageBand: string | null;
}

const oldestOf = (rows: ReserveRowRaw[]) => {
  let months = 0;
  let band = 0;
  for (const row of rows) {
    if (row.ageMonths == null || row.ageBand == null) continue; // bỏ dòng Unknown
    if (row.ageMonths > months) {
      months = row.ageMonths;
      band = BAND_INDEX[row.ageBand] ?? 0;
    }
  }
  return {
    oldestMonths: Math.min(12, Math.floor(months)),
    oldestBandIndex: band,
  };
};

const OverviewView = () => {
  const [ledgerExportContainer, setLedgerExportContainer] = useState<HTMLDivElement | null>(null);
  const { threshold, agedFrom } = useViewOptions();

  // [XÓA] whName/setWhName và 5 useState số: cust, wh, cat, age, year
  // [MỚI] thay bằng 1 state theo tên
  const [sel, setSel] = useState<Selection>({});
  const [monthSpan, setMonthSpan] = useState(12);

  const [ledgerSelection, setLedgerSelection] = useState<LedgerSel>({});
  const [whSrc, setWhSrc] = useState<"summary" | "pivot">("summary");
  const [catSrc, setCatSrc] = useState<"category" | "aged">("category");

  const [pageMonth, setPageMonth] = useState<string | undefined>();

  // [ĐỔI] truyền object, BE lọc theo các tham số này
  const overview = useStockOverview({
    warehouse: sel.wh,
    nameZh: sel.cat,
    name: sel.cust,
    year: sel.year ? Number(sel.year) : undefined,
    month: pageMonth,
    ledgerWarehouse: ledgerSelection.warehouse,
    ledgerCategory: ledgerSelection.category,
    ledgerBuyer: ledgerSelection.buyer,
    ledgerMonth: ledgerSelection.month,
    whSrc: sel.wh ? whSrc : undefined,
    catSrc: sel.cat ? catSrc : undefined,
  });

  const wipQuery = useWipDataset();
  const reserveQuery = useReserveDataset();

  // [ĐỔI] luôn truyền filter = -1, không lọc lại ở client
  const model = useMemo(() => {
    const data = overview.data;
    if (!data || "cube" in data) return null;
    const noFilter: StockFilters = {
      cust: -1,
      wh: -1,
      cat: -1,
      age: -1,
      year: -1,
      agedFrom,
    };
    return buildSummaryOverviewModel(data, noFilter, threshold);
  }, [overview.data, threshold, agedFrom]);

  // [ĐỔI] reset / clear theo state mới
  const resetAll = (): void => {
    setSel({});
    setLedgerSelection({});
    setPageMonth(undefined);
  };

  const clearDimension = (dimension: ScopeDimension): void => {
    if (dimension === "age") return;
    setSel((s) => ({ ...s, [dimension]: undefined }));
  };

  if (overview.isPending) return <OverviewSkeleton />;

  if (!overview.data || !model) {
    return (
      <main className="wrap stack">
        <Card zh="库存总览" en="Stock overview">
          <div className="empty">
            <h3>Unable to load the stock overview</h3>
            <p>
              {getStockErrorMessage(
                overview.error,
                "The stock dataset could not be loaded.",
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                void overview.refetch();
              }}
            >
              Retry
            </button>
          </div>
        </Card>
      </main>
    );
  }

  // [MỚI] tính idx từ tên (đặt SAU các early return, vì cần model khác null)
  const whNames = model.meta.warehouses.map((w) => w.nameZh);
  const catNames = model.meta.categories.map((c) => c.nameZh);
  const custNames = model.meta.customers;
  const yearNames = model.meta.years;

  const wipRaw = wipQuery.data?.data?.summary;
  const wipIdx = whNames.indexOf("WIP");
  const wipSummary =
    wipRaw && wipIdx >= 0 ? { ...wipRaw, storeIdx: wipIdx } : null;
  const reserveRaw = reserveQuery.data?.data;
  const reserveIdx = whNames.indexOf("保留仓 - Reserve Materials WH");
  const reserveSummary =
    reserveRaw && reserveIdx >= 0
      ? {
          ...reserveRaw,
          warehouseIdx: reserveIdx,
          usd: Number(reserveRaw.usd ?? 0),
          atRiskUsd: Number(reserveRaw.atRiskUsd ?? 0),
          ...oldestOf(reserveRaw.rows ?? []),
        }
      : null;

  const idxOf = (labels: string[], value?: string): number =>
    value ? labels.indexOf(value) : -1;

  const wh = idxOf(whNames, sel.wh);
  const cat = idxOf(catNames, sel.cat);
  const cust = idxOf(custNames, sel.cust);
  const year = idxOf(yearNames, sel.year);

  const pick =
    (field: keyof Selection, labels: string[]) =>
    (idx: number): void =>
      setSel((s) => ({ ...s, [field]: idx >= 0 ? labels[idx] : undefined }));

  const setWh = pick("wh", whNames);
  const setCat = pick("cat", catNames);
  // Kho chọn từ card Summary
  const handleWh = (idx: number): void => {
    setLedgerSelection({});
    setWhSrc("summary");
    setWh(idx);
  };

  // Kho chọn từ ô Warehouse trong pivot
  const handlePivotWh = (idx: number): void => {
    setLedgerSelection({});
    setWhSrc("pivot");
    setWh(idx);
  };

  // Category chọn từ biểu đồ Category / từ Aged Rank
  const handleCatChart = (idx: number): void => {
    setCatSrc("category");
    setCat(idx);
  };
  const handleCatAged = (idx: number): void => {
    setCatSrc("aged");
    setCat(idx);
  };
  const setCust = pick("cust", custNames);
  const setYear = (idx: number): void => {
    setPageMonth(undefined);
    if (ledgerSelection.month) setLedgerSelection({});
    pick("year", yearNames)(idx);
  };

  const toggleLedger = (next: LedgerSel): void => {
    const same = (["warehouse", "category", "buyer", "month"] as const).every(
      (k) => ledgerSelection[k] === next[k],
    );
    setLedgerSelection(same ? {} : next);
    if (!same) {
      setSel((s) => ({ ...s, wh: undefined }));
    }
  };

  const handleLedgerCategory = (whIdx: number, catIdx: number): void =>
    toggleLedger({
      warehouse: model.meta.warehouses[whIdx]?.nameZh,
      category: model.meta.categories[catIdx]?.nameZh,
    });

  const handleLedgerBuyer = (
    whIdx: number,
    catIdx: number,
    custIdx: number,
  ): void =>
    toggleLedger({
      warehouse: model.meta.warehouses[whIdx]?.nameZh,
      category: model.meta.categories[catIdx]?.nameZh,
      buyer: model.meta.customers[custIdx],
    });

  const handleLedgerMonth = (month: string): void => {
    if (pageMonth === month) {
      setPageMonth(undefined);
      return;
    }
    setPageMonth(month);
    setSel((s) => ({ ...s, year: undefined }));
    if (ledgerSelection.month) setLedgerSelection({}); // bỏ ô Qty/USD của tháng khác
  };

  const handleLedgerCell = ({
    wh: whIdx,
    cat: catIdx,
    cust: custIdx,
    month,
  }: {
    wh: number;
    cat: number;
    cust: number;
    month: string;
  }): void =>
    toggleLedger({
      warehouse: model.meta.warehouses[whIdx]?.nameZh,
      category: model.meta.categories[catIdx]?.nameZh,
      buyer: model.meta.customers[custIdx],
      month,
    });

  // [ĐỔI] age luôn -1
  const scope: OverviewScope = { cust, wh, cat, age: -1, year };

  return (
    <main className="wrap stack">
      <div className="row-2">
        <Card
          zh="年度汇总"
          en="Annual Summary"
          note={`${usd(model.scoped.usd)} in total`}
        >
          <BarChart
            items={model.yearBars}
            picked={year}
            onPick={setYear}
            muted={model.noYearUsd}
          />
        </Card>
        <Card
          zh="类别汇总"
          en="Category Summary"
          note={`${pct(model.noCatUsd, model.totalUsd)} of total`}
        >
          <BarChart
            items={model.catBars}
            picked={cat}
            onPick={handleCatChart}
            muted={model.noCatUsd}
          />
        </Card>
      </div>

      <Card
        zh="仓库金额"
        en="Warehouse Summary"
        note={`${model.storeRows.length} warehouses · value, highest first`}
      >
        {/* [ĐỔI] onWh={setWh}, wip/reserve = null */}
        <StoreKpis
          rows={model.storeRows}
          meta={model.meta}
          whSel={wh}
          onWh={handleWh}
          wip={wipSummary}
          reserve={reserveSummary}
        />
      </Card>

      <div className="row-2">
        <Card
          zh="客户排行"
          en="Buyer Rank"
          note="by value"
          className="rank-card"
        >
          <RankList rows={model.buyerRows} picked={cust} onPick={setCust} />
        </Card>
        <Card
          zh="库龄排行"
          en="Aged Rank"
          note={`past ${threshold} d`}
          className="rank-card"
        >
          {/* [ĐỔI] picked={cat} onPick={setCat} */}
          <RankList rows={model.agedRows} picked={cat} onPick={handleCatAged} alt />
        </Card>
      </div>

      <Card
        zh="月份明细"
        en="Month × Warehouse Ledger"
        headRight={
          <>
          <div className="seg seg-sm" role="group" aria-label="Month span">
            {MONTH_SPANS.map((option: MonthSpanOption) => (
              <button
                key={option.span}
                type="button"
                className={monthSpan === option.span ? "on" : undefined}
                aria-pressed={monthSpan === option.span}
                onClick={() => setMonthSpan(option.span)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div ref={setLedgerExportContainer} />
          </>
        }
      >
        <PivotTable
          exportContainer={ledgerExportContainer}
          stores={model.pivotStores}
          meta={model.meta}
          axis={model.axis}
          span={monthSpan}
          available={model.ledgerAvailable}
          wh={wh}
          cat={cat}
          cust={cust}
          onWh={handlePivotWh}
          activeMonth={pageMonth}
          onLedgerCategory={handleLedgerCategory}
          onLedgerBuyer={handleLedgerBuyer}
          onLedgerMonth={handleLedgerMonth}
          onLedgerCell={handleLedgerCell}
          ledgerSelection={ledgerSelection}
        />
      </Card>

      <DetailTable
        meta={model.meta}
        scope={scope}
        threshold={threshold}
        scopeLines={
          model.scoped.lines == null ? null : Math.round(model.scoped.lines)
        }
        available={true}
        ledgerSelection={{
          ...ledgerSelection,
          month: ledgerSelection.month ?? pageMonth,
        }}
        onClear={clearDimension}
        onResetAll={resetAll}
      />
    </main>
  );
};

export default OverviewView;
