const { getPool, sql } = require('../config/connectData')
const pagination = require('../utils/Pagination')


class ReseverRepository {
    async ReserveAgeSignals() {
        try {
            const pool = await getPool();
            const result = await pool.request().query(`
                declare @today date = cast(getdate() as date);
                with stock_data as (
                    select
                        end_usd as usd,
                        made_lot_date,
                        stock_in_date,
                        case
                            when stock_in_date is null then made_lot_date
                            when made_lot_date is null then stock_in_date
                            when stock_in_date < made_lot_date then stock_in_date
                            else made_lot_date
                        end as aging_date
                    from dbo.bi_stock
                    where st_name = N'保留仓 - Reserve Materials WH'
                ),
                r as (
                    select
                        usd,
                        made_lot_date,
                        stock_in_date,
                        aging_date,
                        case
                            when aging_date is null
                            or aging_date > @today then 0
                            when dateadd(month, 3, aging_date) > @today then 1
                            when dateadd(month, 6, aging_date) > @today then 2
                            when dateadd(month, 9, aging_date) > @today then 3
                            when dateadd(month, 12, aging_date) > @today then 4
                            else 5
                        end as band
                    from stock_data
                ),
                bands as (
                    select *
                    from (values
                        (1, '< 3 months'),
                        (2, '3–6 months'),
                        (3, '6–9 months'),
                        (4, '9–12 months'),
                        (5, '12+ months')
                    ) v(id, label)
                )
                select
                    b.label,
                    coalesce(sum(r.usd), 0) as usd,
                    cast(
                        100.0 * coalesce(sum(r.usd), 0)
                        / nullif((select sum(usd) from r), 0)
                        as decimal(10, 1)
                    ) as percent_reserve,
                    count(r.band) as line_count,
                    (select coalesce(sum(usd), 0) from r) as total_reserve_usd,
                    (select count(*) from r) as total_reserve_lines
                from bands b
                left join r
                    on r.band = b.id
                group by
                    b.id,
                    b.label
                order by b.id;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
    async AgeBandDistribution() {
        try {
            const pool = await getPool();
            const result = await pool.request().query(`
                declare @today date = cast(getdate() as date);

                with stock_data as (
                    select
                        end_usd as usd,
                        case
                            when stock_in_date is null then made_lot_date
                            when made_lot_date is null then stock_in_date
                            when stock_in_date < made_lot_date then stock_in_date
                            else made_lot_date
                        end as aging_date
                    from dbo.bi_stock
                    where st_name = N'保留仓 - Reserve Materials WH'
                ),
                r as (
                    select
                        usd,
                        aging_date as lot_date
                    from stock_data
                    where aging_date <= @today
                ),
                bands as (
                    select *
                    from (values
                        (1, '0–1 mo',   0,  1),
                        (2, '1–2 mo',   1,  2),
                        (3, '2–3 mo',   2,  3),
                        (4, '3–6 mo',   3,  6),
                        (5, '6–9 mo',   6,  9),
                        (6, '9–12 mo',  9, 12),
                        (7, '12+ mo',  12, null)
                    ) v(id, label, month_from, month_to)
                )
                select
                    b.label,

                    coalesce(sum(r.usd), 0) as usd,

                    (
                        select coalesce(sum(usd), 0)
                        from r
                        where dateadd(month, 6, lot_date) <= @today
                    ) as old_stock_usd,

                    count(r.lot_date) as lines

                from bands b
                left join r
                    on dateadd(month, b.month_from, r.lot_date) <= @today
                and (
                    b.month_to is null
                    or dateadd(month, b.month_to, r.lot_date) > @today
                )
                group by
                    b.id,
                    b.label
                order by b.id;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
    async OldStockbyBuyer() {
        try {
            const pool = await getPool();
            const result = await pool.request().query(`
                declare @today date = cast(getdate() as date);

                with stock_data as (
                    select
                        coalesce(
                            nullif(ltrim(rtrim(cust_name)), N''),
                            N'-'
                        ) as buyer,
                        isnull(end_usd, 0) as usd,
                        made_lot_date,
                        stock_in_date,
                        case
                            when stock_in_date is null then made_lot_date
                            when made_lot_date is null then stock_in_date
                            when stock_in_date < made_lot_date then stock_in_date
                            else made_lot_date
                        end as aging_date
                    from dbo.bi_stock
                    where st_name = N'保留仓 - Reserve Materials WH'
                ),
                r as (
                    select
                        buyer,
                        usd
                    from stock_data
                    where dateadd(month, 6, aging_date) <= @today
                )
                select
                    buyer,
                    count(*) as line_count,
                    sum(usd) as usd,
                    cast(
                        100.0 * sum(usd)
                        / nullif(sum(sum(usd)) over (), 0)
                        as decimal(10, 1)
                    ) as percent_old_stock,
                    sum(sum(usd)) over () as total_old_stock_usd,
                    count(*) over () as buyer_count
                from r
                group by buyer
                order by usd desc;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }


    async CrossFilteredRegister() {
        try {
            const pool = await getPool();
            const result = await pool.request().query(`
                declare @today date = cast(getdate() as date);

                with stock_data as (
                    select
                        st.goods_name,
                        st.goods_type_desc,
                        st.goods_no,
                        st.made_lot,
                        st.made_lot_date,
                        st.stock_in_date,
                        st.cust_name,
                        st.end_usd,
                        case
                            when st.stock_in_date is null then st.made_lot_date
                            when st.made_lot_date is null then st.stock_in_date
                            when st.stock_in_date < st.made_lot_date then st.stock_in_date
                            else st.made_lot_date
                        end as aging_date
                    from dbo.bi_stock st
                    where st.st_name = N'保留仓 - Reserve Materials WH'
                )
                select
                    st.goods_name,
                    st.goods_type_desc,
                    st.goods_no,
                    st.made_lot,
                    st.aging_date as lot_date,
                    st.cust_name as buyer,
                    r.reason_dl,

                    case
                        when st.aging_date is null
                        or st.aging_date > @today then N'Unknown'
                        when dateadd(month, 3, st.aging_date) > @today then N'< 3 months'
                        when dateadd(month, 6, st.aging_date) > @today then N'3–6 months'
                        when dateadd(month, 9, st.aging_date) > @today then N'6–9 months'
                        when dateadd(month, 12, st.aging_date) > @today then N'9–12 months'
                        else N'12+ months'
                    end as age_band,

                    cast(
                        datediff(day, st.aging_date, @today) / 30.0
                        as decimal(10, 1)
                    ) as age_months,

                    st.end_usd as usd

                from stock_data st

                outer apply (
                    select
                        max(reason_dl) as reason_dl
                    from dbo.bi_stock_reason
                    where goods_no = st.goods_no
                    and made_lot = st.made_lot
                ) r

                order by
                    st.aging_date asc,
                    st.end_usd desc;
                `)
            return result.recordset;
        } catch (error) {
            throw error
        }
    }
}
module.exports = new ReseverRepository()