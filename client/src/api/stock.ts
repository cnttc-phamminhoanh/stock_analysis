/**
 * Typed API client for the self-hosted API.
 * Same public surface as the hosted build's client/src/api/stock.ts, but it uses
 * native fetch instead of the platform axios wrapper (no tenant headers needed).
 */
import type {
  ReserveDatasetResponse,
  StockCacheKey,
  StockCacheRefreshResponse,
  StockDetailResponse,
  StockDetailLine,
  StockOverviewData,
  StockOverviewApiResponse,
  StockSourceStatusResponse,
  WipDatasetResponse,
  WipTag,
  WipTagUpdateRequest,
} from "@shared/api.interface";

export interface StockDetailQuery {
  warehouse?: string;
  category?: string;
  customer?: string;
  year?: string;
  ageMin?: number;
  ageMax?: number;
  q?: string;
  sort?: "usd" | "age" | "qty";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  item?: string;
  buyer?: string;
  code?: string;
  lot?: string;
}

export interface OverviewQuery {
  warehouse?: string;
  year?: number;
  nameZh?: string; // category
  name?: string; // customer
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(
  /\/$/,
  "",
);
const url = (path: string): string => `${API_BASE_URL}${path}`;

const apiError = (status: number, body: ApiErrorBody | null): Error => {
  const error = new Error(
    body?.error?.message || `Request failed with status ${status}`,
  );
  return Object.assign(error, { response: { status, data: body } });
};

const readBody = async (response: Response): Promise<ApiErrorBody | null> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as ApiErrorBody;
  } catch {
    return null;
  }
};

const requestGet = async <T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T> => {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]: [string, unknown]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const response = await fetch(url(query ? `${path}?${query}` : path), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw apiError(response.status, await readBody(response));
  return (await response.json()) as T;
};

const requestWrite = async <T>(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<T> => {
  const response = await fetch(url(path), {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw apiError(response.status, await readBody(response));
  return (await response.json()) as T;
};

interface ApiErrorLike {
  response?: { status?: number; data?: ApiErrorBody };
}

export const getStockErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  const candidate = error as ApiErrorLike | null;
  const payload = candidate?.response?.data?.error;
  if (payload?.message) return payload.message;
  if (payload?.fieldErrors) {
    const messages: string[] = Object.values(payload.fieldErrors)
      .flat()
      .filter((item: string): boolean => Boolean(item));
    if (messages.length > 0) return messages[0];
  }
  return fallback;
};

interface DetailRow {
  item: string | null;
  code: string | null;
  lot_batch: string | null;
  date: string | null;
  warehouse: string | null;
  mo_no: string | null;
  cust_style: string | null;
  buyer: string | null;
  category: string | null;
  rem: string | null;
  pmc_rem: string | null;
  reason: string | null;
  age_days: number | null;
  end_qty: number | null;
  end_usd: number | null;
  unit_no: string | null;
}

const toDetailLine = (row: DetailRow, index: number): StockDetailLine => ({
  id: `${row.code ?? ""}|${row.lot_batch ?? ""}|${row.mo_no ?? ""}|${index}`,
  goodsNo: row.code ?? "",
  itemName: row.item ?? "",
  categoryIdx: -1,
  categoryZh: row.category ?? "",
  categoryEn: "",
  customerIdx: -1,
  customerName: row.buyer ?? "-",
  warehouseIdx: -1,
  warehouseZh: row.warehouse ?? "",
  warehouseEn: "",
  qty: row.end_qty ?? 0,
  unit: row.unit_no ?? "",
  usd: row.end_usd ?? 0,
  ageDays: row.age_days ?? 0,
  batchNo: row.lot_batch ?? "",
  lotDate: row.date ? String(row.date).slice(0, 10) : null,
  reasonWh: row.reason ?? "",
  reasonDl: "",
  moNo: row.mo_no,
  custStyle: row.cust_style,
  rem: row.rem,
  pmcRem: row.pmc_rem,
});

interface DetailPayload {
  data?: {
    data?: DetailRow[];
    pagination?: {
      page?: number;
      pageSize?: number;
      totalItems?: number;
      totalPages?: number;
    };
  };
}

const toDetailResponse = (
  raw: unknown,
  page: number,
  pageSize: number,
): StockDetailResponse => {
  const payload = (raw ?? {}) as DetailPayload;
  const rows: DetailRow[] = payload.data?.data ?? [];
  const pg = payload.data?.pagination;
  const offset = (page - 1) * pageSize;
  return {
    items: rows.map((row: DetailRow, i: number) =>
      toDetailLine(row, offset + i),
    ),
    total: Number(pg?.totalItems ?? rows.length),
    page: Number(pg?.page ?? page),
    pageSize: Number(pg?.pageSize ?? pageSize),
  };
};

export const stockApi = {
  overview: async (query: OverviewQuery = {}): Promise<StockOverviewData> => {
    const response = await requestGet<
      StockOverviewData | StockOverviewApiResponse
    >("/api/stock/overview", { ...query });
    if ("success" in response) {
      if (!response.success || !response.data) {
        throw new Error(response.message || "Could not load overview");
      }
      return response.data;
    }
    return response;
  },

  detail: async (query: StockDetailQuery): Promise<StockDetailResponse> => {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const raw = await requestGet<unknown>("/api/stock/detail", {
      page,
      pageSize,
      item: query.item ?? query.code ?? query.lot,
      warehouse: query.warehouse,
      year: query.year,
      nameZh: query.category,
      name: query.buyer,
      sort: query.sort,
      dir: query.dir,
    });
    return toDetailResponse(raw, page, pageSize);
  },

  wip: (): Promise<WipDatasetResponse> =>
    requestGet<WipDatasetResponse>("/api/stock/wip"),

  reserve: (): Promise<ReserveDatasetResponse> =>
    requestGet<ReserveDatasetResponse>("/api/stock/reserve"),

  sourceStatus: (): Promise<StockSourceStatusResponse> =>
    requestGet<StockSourceStatusResponse>("/api/stock/source/status"),

  refreshCache: (keys?: StockCacheKey[]): Promise<StockCacheRefreshResponse> =>
    requestWrite<StockCacheRefreshResponse>(
      "POST",
      "/api/stock/cache/refresh",
      keys ? { keys } : {},
    ),

  updateWipTag: (lotId: string, body: WipTagUpdateRequest): Promise<WipTag> => {
    console.log("📤 Body gửi lên API:", body);
    return requestWrite<WipTag>(
      "PUT",
      `/api/stock/wip/lots/${encodeURIComponent(lotId)}/tag`,
      body,
    );
  },
};
