
const { getPool, sql } = require('../config/connectData')
const pagination = require('../utils/Pagination')
class StockRepository {
    async AnnualSummary(warehouse, year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("warehouse", sql.NVarChar, warehouse?.trim() || null)
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh?.trim() || null)
                .input("name", sql.NVarChar, name?.trim() || null)
                .input("period", sql.Int, period || 0)
                .query(`
                select CAST(ROW_NUMBER() OVER (ORDER BY year(x.stock_date)) - 1 AS INT) AS yearIdx,
                        YEAR(x.stock_date) AS year,
                        ROUND(SUM(b.end_usd), 0) AS usd
                    FROM bi_stock b
                    CROSS APPLY (
                        SELECT CASE
                            WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                            WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                            WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                            ELSE b.made_lot_date
                        END AS stock_date
                    ) x
                    WHERE
                        (
                            @warehouse IS NULL
                            OR (
                                @warehouse = N'半成品仓 - sFG WH'
                                AND b.st_no IN ('106', '306')
                            )
                            OR (
                                @warehouse <> N'半成品仓 - sFG WH'
                                AND b.st_name LIKE N'%' + @warehouse + N'%'
                            )
                        )

                        AND (
                            @year IS NULL
                            OR YEAR(x.stock_date) = @year
                        )

                        AND (
                            @nameZh IS NULL
                            OR b.effect_no LIKE N'%' + @nameZh + N'%'
                        )

                        AND (
                            @name IS NULL
                            OR b.cust_name LIKE N'%' + @name + N'%'
                        )

                        AND (
                            @period IS NULL
                            OR @period = 0
                            OR (
                                x.stock_date >= DATEADD(
                                    MONTH, -@period, CAST(GETDATE() AS DATE)
                                )
                                AND x.stock_date < DATEADD(
                                    DAY, 1, CAST(GETDATE() AS DATE)
                                )
                            )
                        )
                    group by year(x.stock_date)
                    order by year(x.stock_date) asc
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }

    async CategorySummary(warehouse, year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("warehouse", sql.NVarChar, warehouse?.trim() || null)
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh || null)
                .input("name", sql.NVarChar, name || null)
                .input("period", sql.Int, period || 0)
                .query(`
                select CAST(ROW_NUMBER() OVER (ORDER BY b.effect_no) - 1 AS INT) AS categoryIdx, 
                        b.effect_no as nameZh,
                        ROUND(SUM(b.end_usd), 0) AS usd
                    FROM bi_stock b
                    CROSS APPLY (
                        SELECT CASE
                            WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                            WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                            WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                            ELSE b.made_lot_date
                        END AS stock_date
                    ) x
                    WHERE
                        (
                            @warehouse IS NULL
                            OR (
                                @warehouse = N'半成品仓 - sFG WH'
                                AND b.st_no IN ('106', '306')
                            )
                            OR (
                                @warehouse <> N'半成品仓 - sFG WH'
                                AND b.st_name LIKE N'%' + @warehouse + N'%'
                            )
                        )

                        AND (
                            @year IS NULL
                            OR YEAR(x.stock_date) = @year
                        )

                        AND (
                            @nameZh IS NULL
                            OR b.effect_no LIKE N'%' + @nameZh + N'%'
                        )

                        AND (
                            @name IS NULL
                            OR b.cust_name LIKE N'%' + @name + N'%'
                        )

                        AND (
                            @period = 0
                            OR (
                                x.stock_date >= DATEADD(
                                    MONTH, -@period, CAST(GETDATE() AS DATE)
                                )
                                AND x.stock_date < DATEADD(
                                    DAY, 1, CAST(GETDATE() AS DATE)
                                )
                            )
                        )
                    group by b.effect_no
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
    async WarehouseSummary(year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh)
                .input("name", sql.NVarChar, name)
                .input("period", sql.Int, period)
                .query(`
                SELECT
                    CAST(ROW_NUMBER() OVER (ORDER BY SUM(b.end_usd) DESC) - 1 AS INT) AS warehouseIdx,
                        CASE
                                WHEN b.st_no IN ('106', '306') THEN N'半成品仓 - sFG WH'
                                ELSE b.st_name
                            END AS  nameZh,
                            ROUND(SUM(b.end_usd), 0) AS usd
                        FROM bi_stock b
                        CROSS APPLY (
                            SELECT CASE
                                WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                                WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                                WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                                ELSE b.made_lot_date
                            END AS stock_date
                        ) x
                        WHERE
                            (
                                @year IS NULL
                                OR YEAR(x.stock_date) = @year
                            )

                            AND (
                                @nameZh IS NULL
                                OR b.effect_no LIKE N'%' + @nameZh + N'%'
                            )

                            AND (
                                @name IS NULL
                                OR b.cust_name LIKE N'%' + @name + N'%'
                            )

                            AND (
                                @period = 0
                                OR (
                                    x.stock_date >= DATEADD(
                                        MONTH, -@period, CAST(GETDATE() AS DATE)
                                    )
                                    AND x.stock_date < DATEADD(
                                        DAY, 1, CAST(GETDATE() AS DATE)
                                    )
                                )
                            )
                    GROUP BY
                        CASE
                            WHEN b.st_no IN ('106', '306') THEN N'半成品仓 - sFG WH'
                            ELSE b.st_name
                        END
                    ORDER BY usd DESC;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
    async BuyerRank(warehouse, year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("warehouse", sql.NVarChar, warehouse?.trim() || null)
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh || null)
                .input("name", sql.NVarChar, name || null)
                .input("period", sql.Int, period || 0)
                .query(`
                select CAST (ROW_NUMBER() OVER (ORDER BY cust_name) - 1 AS INT) AS customerIdx,
                            ISNULL(b.cust_name, '-') AS name,
                            ROUND(SUM(b.end_usd), 0) AS usd
                        FROM bi_stock b
                        CROSS APPLY (
                            SELECT CASE
                                WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                                WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                                WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                                ELSE b.made_lot_date
                            END AS stock_date
                        ) x
                        WHERE
                            (
                                @warehouse IS NULL
                                OR (
                                    @warehouse = N'半成品仓 - sFG WH'
                                    AND b.st_no IN ('106', '306')
                                )
                                OR (
                                    @warehouse <> N'半成品仓 - sFG WH'
                                    AND b.st_name LIKE N'%' + @warehouse + N'%'
                                )
                            )

                            AND (
                                @year IS NULL
                                OR YEAR(x.stock_date) = @year
                            )

                            AND (
                                @nameZh IS NULL
                                OR b.effect_no LIKE N'%' + @nameZh + N'%'
                            )

                            AND (
                                @name IS NULL
                                OR b.cust_name LIKE N'%' + @name + N'%'
                            )

                            AND (
                                @period = 0
                                OR (
                                    x.stock_date >= DATEADD(
                                        MONTH, -@period, CAST(GETDATE() AS DATE)
                                    )
                                    AND x.stock_date < DATEADD(
                                        DAY, 1, CAST(GETDATE() AS DATE)
                                    )
                                )
                            )
                        GROUP BY b.cust_name
                        ORDER BY usd DESC;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }

    async AgedRank(warehouse, year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("warehouse", sql.NVarChar, warehouse?.trim() || null)
                .input("threshold", sql.Int, 90)
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh || null)
                .input("name", sql.NVarChar, name || null)
                .input("period", sql.Int, period || 0)
                .query(`
                select CAST (ROW_NUMBER() OVER (ORDER BY effect_no) - 1 AS INT) AS categoryIdx,
                        b.effect_no as nameZh,
                        ROUND(SUM(b.end_usd), 0) AS agedUsd
                    FROM bi_stock b
                    CROSS APPLY (
                        SELECT CASE
                            WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                            WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                            WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                            ELSE b.made_lot_date
                        END AS stock_date
                    ) x
                    WHERE
                        (
                            @threshold IS NULL
                            OR DATEDIFF(
                                DAY, x.stock_date, GETDATE()
                            ) > @threshold
                        )

                        AND (
                            @warehouse IS NULL
                            OR (
                                @warehouse = N'半成品仓 - sFG WH'
                                AND b.st_no IN ('106', '306')
                            )
                            OR (
                                @warehouse <> N'半成品仓 - sFG WH'
                                AND b.st_name LIKE N'%' + @warehouse + N'%'
                            )
                        )

                        AND (
                            @year IS NULL
                            OR YEAR(x.stock_date) = @year
                        )

                        AND (
                            @nameZh IS NULL
                            OR b.effect_no LIKE N'%' + @nameZh + N'%'
                        )

                        AND (
                            @name IS NULL
                            OR b.cust_name LIKE N'%' + @name + N'%'
                        )

                        AND (
                            @period = 0
                            OR (
                                x.stock_date >= DATEADD(
                                    MONTH, -@period, CAST(GETDATE() AS DATE)
                                )
                                AND x.stock_date < DATEADD(
                                    DAY, 1, CAST(GETDATE() AS DATE)
                                )
                            )
                        )
                    group by b.effect_no
                    order by agedUsd DESC;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }

    async WarehouseLedger(warehouse, year, nameZh, name, period) {
        try {
            const pool = await getPool();
            const result = await pool.request()
                .input("warehouse", sql.NVarChar, warehouse?.trim() || null)
                .input("year", sql.Int, year)
                .input("nameZh", sql.NVarChar, nameZh || null)
                .input("name", sql.NVarChar, name || null)
                .input("period", sql.Int, period || 0)
                .query(`
                --DECLARE @period INT = 0;
                -- 6  = 6 tháng gần nhất
                -- 12 = 12 tháng gần nhất
                -- 0  = Tất cả

                SELECT
                    CASE
                        WHEN b.st_no IN ('106', '306') THEN N'半成品仓 - sFG WH'
                        ELSE b.st_name
                    END AS warehouseName,
                    b.effect_no as categoryName,
                    ISNULL(b.cust_name, '-') AS customerName,
                    FORMAT(x.stock_date, 'yyyy-MM') AS [month],
                    SUM(b.end_qty) AS qty,
                    ROUND(SUM(b.end_usd), 0) AS usd
                FROM bi_stock b
                CROSS APPLY (
                    SELECT CASE
                        WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                        WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                        WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                        ELSE b.made_lot_date
                    END AS stock_date
                ) x
                WHERE
                    (
                        @warehouse IS NULL
                        OR (
                            @warehouse = N'半成品仓 - sFG WH'
                            AND b.st_no IN ('106', '306')
                        )
                        OR (
                            @warehouse <> N'半成品仓 - sFG WH'
                            AND b.st_name LIKE N'%' + @warehouse + N'%'
                        )
                    )

                    AND (
                        @year IS NULL
                        OR YEAR(x.stock_date) = @year
                    )

                    AND (
                        @nameZh IS NULL
                        OR b.effect_no LIKE N'%' + @nameZh + N'%'
                    )

                    AND (
                        @name IS NULL
                        OR b.cust_name LIKE N'%' + @name + N'%'
                    )

                    AND (
                        @period = 0
                        OR (
                            x.stock_date >= DATEADD(
                                MONTH, -@period, CAST(GETDATE() AS DATE)
                            )
                            AND x.stock_date < DATEADD(
                                DAY, 1, CAST(GETDATE() AS DATE)
                            )
                        )
                    )

                GROUP BY
                    CASE
                        WHEN b.st_no IN ('106', '306') THEN N'半成品仓 - sFG WH'
                        ELSE b.st_name
                    END,
                    b.effect_no,
                    ISNULL(b.cust_name, '-'),
                    FORMAT(x.stock_date, 'yyyy-MM')
                ORDER BY
                    [month] DESC,
                    warehouseName,
                    categoryName,
                    customerName
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
    // api detail
    async detail(filter = {}) {
        try {
            const {
                page,
                pageSize,
                item,
                warehouse,
                year,
                nameZh,
                name,
                period
            } = filter
            const query = `SELECT
                b.goods_name AS item,
                b.goods_no AS code,
                b.made_lot AS lot_batch, 
                x.stock_date AS [date],
                CASE
                    WHEN b.st_no IN ('106', '306') THEN N'半成品仓 - sFG WH'
                    ELSE b.st_name
                END AS warehouse,
                b.mo_no,
                b.cust_style,
                ISNULL(b.cust_name, '-') AS buyer,
                b.effect_no AS category,
                b.rem,
                b.pmc_rem,
                ISNULL(NULLIF(LTRIM(RTRIM(b.reason)), ''), N'—') AS reason,
                DATEDIFF(DAY, x.stock_date, CAST(GETDATE() AS DATE)) AS age_days,
                b.end_qty,
                b.end_usd,
                b.unit_no
            FROM bi_stock b
            CROSS APPLY (
                SELECT CASE
                    WHEN b.stock_in_date IS NULL THEN b.made_lot_date
                    WHEN b.made_lot_date IS NULL THEN b.stock_in_date
                    WHEN b.stock_in_date > b.made_lot_date THEN b.stock_in_date
                    ELSE b.made_lot_date
                END AS stock_date
            ) x
            where 
                (
                @item IS NULL
                OR (
                    b.made_lot LIKE N'%' + @item + N'%'
                    OR b.goods_no LIKE N'%' + @item + N'%'
                    OR b.goods_name LIKE N'%' + @item + N'%'
                    OR b.cust_name LIKE N'%' + @item + N'%'
                    --OR b.st_name LIKE N'%' + @item + N'%'
                )
            )

            AND (
                @warehouse IS NULL
                OR (
                    @warehouse = N'半成品仓 - sFG WH'
                    AND b.st_no IN ('106', '306')
                )
                OR (
                    @warehouse <> N'半成品仓 - sFG WH'
                    AND b.st_name LIKE N'%' + @warehouse + N'%'
                )
            )

            AND (
                @year IS NULL
                OR YEAR(x.stock_date) = @year
            )

            AND (
                @nameZh IS NULL
                OR b.effect_no LIKE N'%' + @nameZh + N'%'
            )

            AND (
                @name IS NULL
                OR b.cust_name LIKE N'%' + @name + N'%'
            )

            AND (
                @period = 0
                OR (
                    x.stock_date >= DATEADD(
                        MONTH, -@period, CAST(GETDATE() AS DATE)
                    )
                    AND x.stock_date < DATEADD(
                        DAY, 1, CAST(GETDATE() AS DATE)
                    )
                )
            );
        `
            return pagination({
                query,
                params: {
                    item: item?.trim() || null,
                    warehouse: warehouse?.trim() || null,
                    year: year ?? null,
                    nameZh: nameZh?.trim() || null,
                    name: name?.trim() || null,
                    period: period ?? 0
                },
                page,
                pageSize,
                orderBy: "[date] DESC"
            })
        } catch (error) {
            throw error
        }
    }
}
module.exports = new StockRepository()
