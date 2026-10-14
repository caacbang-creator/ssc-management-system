// Officers: process student requests. Transactions are never deleted.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
// Each action adds its own, narrower role check:
//   processors (PRO, President): move to review, mark completed
//   approvers (VP Internal, President): approve, reject  (decision C4)
const express = require('express');
const transactionModel = require('../models/transactionModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'completed', 'cancelled'];
const processorsOnly = requireRole('pro', 'president');
const approversOnly = requireRole('vp_internal', 'president');

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// Optional remarks: '' becomes null so the SQL keeps the old remarks
function optionalRemarks(body) {
  const remarks = String(body.remarks ?? '').trim();
  return remarks === '' ? null : remarks;
}

async function refuseOrNotFound(req, res, id, message) {
  const existing = await transactionModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `/manage/transactions/${id}`);
}

async function renderShow(res, status, id, errors, oldRemarks) {
  const transaction = await transactionModel.findById(id);
  if (!transaction) return notFound(res);
  res.status(status).render('manage/transactions/show', {
    title: `Request ${transaction.reference_no}`, transaction, errors, oldRemarks
  });
}

router.get('/', async (req, res, next) => {
  try {
    const types = req.app.locals.transactionTypes;
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const type = Object.keys(types).includes(req.query.type) ? req.query.type : '';
    const transactions = await transactionModel.listForManage(status, type);
    res.render('manage/transactions/index', { title: 'Manage requests', transactions, status, type });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    await renderShow(res, 200, id, [], '');
  } catch (err) {
    next(err);
  }
});

// pending -> under_review
router.post('/:id/review', processorsOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const remarks = optionalRemarks(req.body);
    if (remarks && remarks.length > 500) {
      return renderShow(res, 422, id, ['Remarks must be 500 characters or fewer.'], remarks);
    }
    const changed = await transactionModel.startReview(id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending requests can be moved to review.');
    req.session.flash = { type: 'success', message: 'Request is now under review. The VP or President will decide.' };
    res.redirect(303, `/manage/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// under_review -> approved
router.post('/:id/approve', approversOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const remarks = optionalRemarks(req.body);
    if (remarks && remarks.length > 500) {
      return renderShow(res, 422, id, ['Remarks must be 500 characters or fewer.'], remarks);
    }
    const changed = await transactionModel.approve(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only requests under review can be approved.');
    req.session.flash = { type: 'success', message: 'Request approved.' };
    res.redirect(303, `/manage/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// under_review -> rejected (a reason is required)
router.post('/:id/reject', approversOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const remarks = String(req.body.remarks ?? '').trim();
    if (remarks === '' || remarks.length > 500) {
      return renderShow(res, 422, id, ['A reason is required when rejecting (up to 500 characters).'], remarks);
    }
    const changed = await transactionModel.reject(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only requests under review can be rejected.');
    req.session.flash = { type: 'success', message: 'Request rejected. The student can see your reason.' };
    res.redirect(303, `/manage/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// approved -> completed
router.post('/:id/complete', processorsOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await transactionModel.complete(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only approved requests can be marked completed.');
    req.session.flash = { type: 'success', message: 'Request marked as completed.' };
    res.redirect(303, `/manage/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
