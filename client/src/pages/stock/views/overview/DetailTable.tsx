import { useEffect, useState } from "react";

import type { StockDetailLine, OverviewMeta } from "@shared/api.interface";

import { getStockErrorMessage } from "../../../../api/stock";
import type { StockDetailQuery } from "../../../../api/stock";
import Card from "../../components/Card";
import { useStockDetail } from "../../hooks/useStockData";
import { num, usd } from "../../lib/format";
import { storeStyle } from "../../lib/store";
import DetailTools from "./DetailTools";
import ScopeChips from "./ScopeChips";
import type { OverviewScope, ScopeDimension } from "./scope";
import { STOCK_AGE_BOUNDS } from "@shared/api.interface";

type SortKey = "usd" | "age" | "qty";

type SearchBy = "item" | "code" | "lot" | "buyer";

const SEARCH_FIELDS: { key: SearchBy; label: string }[] = [
  { key: "item", label: "Item 物料" },
  { key: "code", label: "Code 编码" },
  { key: "lot", label: "Lot / batch 批次" },
  { key: "buyer", label: "Buyer 客户" },
];

interface DetailSort {
  key: SortKey;
  dir: "asc" | "desc";
}

const PAGE_SIZE = 12;

interface DetailTableProps {
  meta: OverviewMeta;
  scope: OverviewScope;
  threshold: number;
  scopeLines: number | null;
  available?: boolean;
  ledgerSelection?: {
    warehouse?: string;
    category?: string;
    buyer?: string;
    month?: string;
  };

  onClear: (dimension: ScopeDimension) => void;
  onResetAll: () => void;
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: DetailSort | null;
  onSort: (key: SortKey) => void;
  className?: string;
}

const SortHeader = ({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: SortHeaderProps) => {
  const active = sort?.key === sortKey;
  const ariaSort: "ascending" | "descending" | "none" = active
    ? sort!.dir === "desc"
      ? "descending"
      : "ascending"
    : "none";
  const pick = (): void => onSort(sortKey);

  return (
    <th
      className={`${className ?? ""} sortable${active ? " sorted" : ""}`}
      role="button"
      tabIndex={0}
      aria-sort={ariaSort}
      onClick={pick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          pick();
        }
      }}
    >
      {label}
      <span className="arrow" aria-hidden="true">
        {active ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}
      </span>
    </th>
  );
};

/* 1 2 3 … 2543 : trang đầu, trang cuối và vài trang quanh trang hiện tại */
const buildPages = (pages: number, current: number): (number | "…")[] => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", pages];
  if (current >= pages - 3)
    return [1, "…", pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, "…", current - 1, current, current + 1, "…", pages];
};

const DetailTable = ({
  meta,
  scope,
  threshold,
  scopeLines,
  available = true,
  ledgerSelection,
  onClear,
  onResetAll,
}: DetailTableProps) => {
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState<SearchBy>("item");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<DetailSort | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Chỉ về trang 1 khi đổi bộ lọc / tìm kiếm; đổi cách sắp xếp thì GIỮ nguyên trang hiện tại
  useEffect(() => {
    setPage(1);
  }, [
    scope.cust,
    scope.wh,
    scope.cat,
    scope.age,
    scope.year,
    term,
    searchBy,
    ledgerSelection?.warehouse,
    ledgerSelection?.category,
    ledgerSelection?.buyer,
    ledgerSelection?.month,
  ]);

  const whItem = scope.wh >= 0 ? meta.warehouses[scope.wh] : undefined;
  const catItem = scope.cat >= 0 ? meta.categories[scope.cat] : undefined;
  const ageBound = scope.age >= 0 ? STOCK_AGE_BOUNDS[scope.age] : undefined;

  const clickedBuyer = scope.cust >= 0 ? meta.customers[scope.cust] : undefined;

  const query: StockDetailQuery = {
    item: searchBy === "item" ? term || undefined : undefined,
    code: searchBy === "code" ? term || undefined : undefined,
    lot: searchBy === "lot" ? term || undefined : undefined,

    // Ưu tiên lựa chọn từ PivotTable
    buyer:
      ledgerSelection?.buyer ||
      (searchBy === "buyer" && term ? term : clickedBuyer),

    warehouse:
      ledgerSelection?.warehouse ||
      (whItem ? whItem.rawName || whItem.nameZh : undefined),

    category: ledgerSelection?.category || catItem?.nameZh,

    year: scope.year >= 0 ? meta.years[scope.year] : undefined,
    ageMin: ageBound?.[0],
    ageMax: ageBound?.[1],

    // Các tham số drill-down từ PivotTable
    ledgerCategory: ledgerSelection?.category,
    ledgerBuyer: ledgerSelection?.buyer,
    ledgerMonth: ledgerSelection?.month,

    sort: sort?.key,
    dir: sort?.dir,
    page,
    pageSize: PAGE_SIZE,
  };

  const detail = useStockDetail(query, available);

  const lines: StockDetailLine[] = available ? (detail.data?.items ?? []) : [];
  const total = detail.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, total);

  const toggleSort = (key: SortKey): void => {
    setSort((prev: DetailSort | null) => {
      // chưa chọn cột này: sắp giảm dần
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      // đang giảm dần: đảo thành tăng dần
      if (prev.dir === "desc") return { key, dir: "asc" };
      // đang tăng dần: bỏ sắp xếp, về mặc định (theo ngày)
      return null;
    });
  };

  const clearAll = (): void => {
    setSearch("");
    setTerm("");
    onResetAll();
  };

  return (
    <Card
      zh="库存明细"
      en="Stock Detail"
      headRight={
        <>
          <DetailTools
            search={search}
            onSearch={setSearch}
            shown={available ? total : null}
            total={scopeLines}
          />
        </>
      }
    >
      <ScopeChips
        meta={meta}
        scope={scope}
        onClear={onClear}
        onClearAll={clearAll}
      />
      {available && detail.isPending ? (
        <p className="card-sub">Loading stock lines…</p>
      ) : null}
      <div className="detail-body">
        <div className="table-scroll">
          <table className="detail detail-wide">
            <colgroup>
              <col style={{ width: 400 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ maxWidth: 240 }}>Item 物料</th>
                <th>Code 编码</th>
                <th>Lot / batch 批次</th>
                <th className="nowrap">Date</th>
                <th>Warehouse 仓库</th>
                <th>MO No.</th>
                <th>Style</th>
                <th>Buyer 客户</th>
                <th>Category 品类</th>
                <th>Stock Remark</th>
                <th>PMC Remark</th>
                <th>Reason 原因</th>
                <SortHeader
                  label="Age (d)"
                  sortKey="age"
                  sort={sort}
                  onSort={toggleSort}
                  className="num"
                />
                <SortHeader
                  label="Qty"
                  sortKey="qty"
                  sort={sort}
                  onSort={toggleSort}
                  className="num"
                />
                <SortHeader
                  label="Value"
                  sortKey="usd"
                  sort={sort}
                  onSort={toggleSort}
                  className="num"
                />
              </tr>
            </thead>
            <tbody>
              {!available ? (
                <tr className="row">
                  {Array.from({ length: 11 }, (_, index) => (
                    <td key={index}>—</td>
                  ))}
                </tr>
              ) : null}
              {lines.map((line: StockDetailLine) => {
                const aged = line.ageDays > threshold;
                const warehouse = meta.warehouses[line.warehouseIdx];
                const tone = warehouse
                  ? storeStyle(line.warehouseIdx, warehouse).tone
                  : "var(--blue)";
                const reason = line.reasonDl || line.reasonWh;
                return (
                  <tr className="row" key={line.id}>
                    <td>
                      <span className="cell-item">
                        <span className="name">{line.itemName}</span>
                      </span>
                    </td>
                    <td className="mono-cell">{line.goodsNo}</td>
                    <td className="mono-cell">{line.batchNo || "—"}</td>
                    <td className="mono-cell">{line.lotDate || "—"}</td>
                    <td>
                      <span className="wh-cell">
                        <span
                          className="wh-dot"
                          style={{ background: tone }}
                        ></span>
                        {line.warehouseZh}
                      </span>
                    </td>
                    <td className="mono-cell">{line.moNo || "—"}</td>
                    <td className="mono-cell">{line.custStyle || "—"}</td>
                    <td className="mono-cell">{line.customerName}</td>
                    <td className="cat-cell2" title={line.categoryEn}>
                      {line.categoryZh}
                    </td>

                    {/* Stock Remark */}
                    <td className="reason-cell" title={line.rem ?? undefined}>
                      {line.rem ? (
                        line.rem
                      ) : (
                        <span className="not-recorded">—</span>
                      )}
                    </td>

                    {/* PMC Remark */}
                    <td
                      className="reason-cell"
                      title={line.pmcRem ?? undefined}
                    >
                      {line.pmcRem ? (
                        line.pmcRem
                      ) : (
                        <span className="not-recorded">—</span>
                      )}
                    </td>

                    {/* Reason (đã chuyển xuống sau 2 remark) */}
                    <td className="reason-cell">
                      {reason ? (
                        reason
                      ) : (
                        <span className="not-recorded">Not recorded</span>
                      )}
                    </td>

                    <td className="num">
                      <span className={`age-pill ${aged ? "hot" : "cool"}`}>
                        {Math.round(line.ageDays)}
                      </span>
                    </td>
                    <td className="num">
                      {num(line.qty)}{" "}
                      <span style={{ color: "var(--faint)", fontSize: "11px" }}>
                        {line.unit}
                      </span>
                    </td>
                    <td className={`num value-cell${aged ? " aged" : ""}`}>
                      {usd(line.usd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {available && detail.isError ? (
          <div className="empty">
            <h3>Stock lines could not be loaded</h3>
            <p>
              {getStockErrorMessage(
                detail.error,
                "The detail register request failed.",
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                void detail.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {available && !detail.isError && detail.data && total === 0 ? (
          <div className="empty">
            <h3>No lines in this scope</h3>
            <p>
              The current filters and search exclude every listed line. Widen
              the scope or clear the search.
            </p>
            <button type="button" onClick={clearAll}>
              Clear all filters
            </button>
          </div>
        ) : null}

        <div className="pager">
          <span className="pager-info">
            Page {available ? safePage : "—"} of {available ? pages : "—"} ·
            showing {available ? from : "—"}–{available ? to : "—"} of{" "}
            {num(available ? total : null)}
          </span>
          <div className="pager-btns">
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              aria-label="First page"
            >
              «
            </button>
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              aria-label="Previous page"
            >
              ‹
            </button>
            {buildPages(pages, safePage).map((entry, index) =>
              entry === "…" ? (
                <span className="page-gap" key={`gap-${index}`}>
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  className={`page-btn${entry === safePage ? " current" : ""}`}
                  aria-current={entry === safePage ? "page" : undefined}
                  onClick={() => setPage(entry)}
                >
                  {entry}
                </button>
              ),
            )}
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.min(pages, safePage + 1))}
              disabled={safePage >= pages}
              aria-label="Next page"
            >
              ›
            </button>
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(pages)}
              disabled={safePage >= pages}
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DetailTable;
