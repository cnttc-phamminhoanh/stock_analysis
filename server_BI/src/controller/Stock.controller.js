
const StockService = require('../services/Stock.service')
const ApiSuccess = require('../utils/ApiSuccess')
const ApiError = require('../utils/ApiError')

exports.GetOverview = async (req, res, next) => {
    try {
        const warehouse = req.query.warehouse;
        const year = Number(req.query.year);
        const nameZh = req.query.nameZh;
        const name = req.query.name;
        const period = Number(req.query.period ?? 0);
        const month = req.query.month;
        const summaryMonth = req.query.ledgerMonth || month; 
        const whFromPivot = req.query.whSrc === 'pivot';
        const catFromAged = req.query.catSrc === 'aged'; 
        const ledger = {
            warehouse: req.query.ledgerWarehouse,
            category: req.query.ledgerCategory,
            buyer: req.query.ledgerBuyer,
        };

        if ( year < 0 || period < 0) {
            return res.json(ApiError.BadRequest('year', 'Invalid year || period value. It must be a non-negative number.'));
        }
        const [
            annualSummary,
            categorySummary,
            warehouseSummary,
            buyerRank,
            agedRank,
            monthWarehouseLedger
        ] = await Promise.all([
            StockService.AnnualSummary(warehouse, NaN, nameZh, name, period, summaryMonth, ledger),         
            StockService.CategorySummary(warehouse, year, catFromAged ? nameZh : undefined, name, period, summaryMonth, ledger),
            StockService.WarehouseSummary(
                year, nameZh, name, period, summaryMonth,
                { ...ledger, warehouse: ledger.warehouse || (whFromPivot ? warehouse : undefined) }),  
            StockService.BuyerRank(warehouse, year, nameZh, undefined, period, summaryMonth, ledger),        
            StockService.AgedRank(warehouse, year, catFromAged ? undefined : nameZh, name, period, summaryMonth, ledger),
            StockService.monthWarehouseLedge(whFromPivot ? null : warehouse, year, nameZh, name, period), 
        ])

        return res.json(ApiSuccess.getSelect('overview', {
            annualSummary,
            categorySummary,
            warehouseSummary,
            buyerRank, agedRank,
            monthWarehouseLedger
        }));
    } catch (error) {
        return next(error)
    }
}

exports.GetDetail = async (req, res, next) => {
    try {
        const data = {
            item: req.query.item,
            warehouse: req.query.warehouse,
            year: Number(req.query.year),
            nameZh: req.query.nameZh,
            name: req.query.name,
            period: Number(req.query.period ?? 0),
            page: Number(req.query.page ?? 1),
            pageSize: Number(req.query.pageSize ?? 25),
            sort: req.query.sort,
            dir: req.query.dir,
            ledgerCategory: req.query.ledgerCategory,
            ledgerBuyer: req.query.ledgerBuyer,
            ledgerMonth: req.query.ledgerMonth,
        };
        const items = await StockService.detail(data);
        return res.json(ApiSuccess.getSelect('detail', items))
    } catch (error) {
        return next(error)
    }
}