/**
 * routes/claim.js — POST /api/claim
 * Accepts { citizen_id, scheme }, runs the 5-gate validator, returns result.
 * Raw citizen_id is hashed immediately and never stored or echoed.
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../services/validator');

router.post('/', (req, res) => {
    const { citizen_id, scheme } = req.body;

    // Basic input presence check
    if (!citizen_id || !scheme) {
        return res.status(400).json({
            approved: false,
            gate: 'Input',
            reason: 'Missing required fields: citizen_id and scheme.',
        });
    }

    // Validate Citizen ID format: exactly 12 digits
    const cidStr = String(citizen_id).trim();
    if (!/^\d{12}$/.test(cidStr)) {
        return res.status(400).json({
            approved: false,
            gate: 'Input',
            reason: 'Invalid Citizen ID format. Must be exactly 12 digits.',
        });
    }

    // Run sequential validation engine (hash is created inside validate)
    const result = validate({ citizenId: cidStr, scheme: String(scheme).trim() });

    // Ensure citizenHash is NEVER sent back in the response
    const { citizenHash, ...safeResult } = result; // eslint-disable-line no-unused-vars

    return res.json(safeResult);
});

module.exports = router;
