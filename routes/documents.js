// Public SSC Documents page: published financial reports, resolutions and other documents.
// No login needed. Drafts and pending items are "not found".
const express = require('express');
const financialReportModel = require('../models/financialReportModel');
const financialExpenseModel = require('../models/financialExpenseModel');
const financialSaleModel = require('../models/financialSaleModel');
const annualBudgetModel = require('../models/annualBudgetModel');
const resolutionModel = require('../models/resolutionModel');
const documentModel = require('../models/documentModel');

const router = express.Router();

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// 'SSC-RES-2025-005' -> 'Resolution No. 005, s. 2025–2026' (the SSC's official style).
// Any other number format is shown as it is.
router.use((req, res, next) => {
  res.locals.resolutionLabel = (no) => {
    const match = /^SSC-RES-(\d{4})-(\d+)$/.exec(no);
    return match ? `Resolution No. ${match[2]}, s. ${match[1]}–${Number(match[1]) + 1}` : no;
  };
  next();
});

router.get('/', async (req, res, next) => {
  try {
    const reports = await financialReportModel.listPublished();
    const resolutions = await resolutionModel.listPublished();
    const documents = await documentModel.listPublished();
    // This school year's budget, and what its published reports spent and earned (C18)
    const schoolYear = req.app.locals.schoolYearOf();
    const budget = await annualBudgetModel.find(schoolYear);
    const yearTotals = await financialReportModel.yearTotals(schoolYear);
    res.render('documents/index', {
      title: 'SSC Documents', reports, resolutions, documents, schoolYear, budget, yearTotals
    });
  } catch (err) {
    next(err);
  }
});

router.get('/financial-reports/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findPublishedById(id) : null;
    if (!report) return notFound(res);
    const expenses = await financialExpenseModel.listForReport(id);
    const sales = await financialSaleModel.listForReport(id);
    res.render('documents/financial-report', { title: report.title, report, expenses, sales });
  } catch (err) {
    next(err);
  }
});

router.get('/resolutions/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const resolution = id ? await resolutionModel.findPublishedById(id) : null;
    if (!resolution) return notFound(res);
    res.render('documents/resolution', { title: resolution.title, resolution });
  } catch (err) {
    next(err);
  }
});

router.get('/other/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const doc = id ? await documentModel.findPublishedById(id) : null;
    if (!doc) return notFound(res);
    res.render('documents/document', { title: doc.title, doc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
