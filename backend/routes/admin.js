/**
 * routes/admin.js — Admin Dashboard API
 * GET  /api/admin/status  — system state snapshot
 * POST /api/admin/pause   — pause the system
 * POST /api/admin/resume  — resume the system
 * GET  /api/admin/ledger  — last 20 ledger entries
 */

const express = require('express');
const router = express.Router();
const state = require('../services/state');
const { verifyIntegrity, getLastLines } = require('../services/ledger');

// GET /api/admin/status
router.get('/status', (req, res) => {
    const s = state.getState();
    const ledgerIntegrity = verifyIntegrity();
    res.json({
        status: s.status,
        budget: s.budget,
        initialBudget: s.initialBudget,
        transactionCount: s.transactionCount,
        ledgerIntegrity,
    });
});

// POST /api/admin/pause
router.post('/pause', (req, res) => {
    state.pause();
    const s = state.getState();
    res.json({ success: true, status: s.status });
});

// POST /api/admin/resume
router.post('/resume', (req, res) => {
    state.resume();
    const s = state.getState();
    res.json({ success: true, status: s.status });
});

// GET /api/admin/ledger
router.get('/ledger', (req, res) => {
    const entries = getLastLines(20);
    res.json({ entries });
});

module.exports = router;
