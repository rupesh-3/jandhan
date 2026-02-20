/**
 * validator.js — 5-Gate Sequential Validation Engine
 *
 * Gates (in strict order):
 *  Gate 1 — System Status  : System must be 'active'
 *  Gate 2 — Replay Block   : Citizen hash must not be in session processed set
 *  Gate 3 — Eligibility    : Active account, Aadhaar linked, scheme match, claim_count ≤ 3
 *  Gate 4 — Budget         : Sufficient budget available; deduct on pass
 *  Gate 5 — Frequency      : Last claim must be > 30 days ago
 *
 * On approval: deducts budget, increments tx count, records hash, writes to ledger.
 */

const state = require('./state');
const registry = require('./registry');
const ledger = require('./ledger');

// In-memory set of citizen hashes processed in this server session.
// Prevents replay of the exact same Citizen_ID within a session.
const processedHashes = new Set();

/**
 * Main validation entry point.
 * @param {{ citizenId: string, scheme: string }} param
 * @returns {{ approved: boolean, reason: string, amount?: number, timestamp?: string }}
 */
function validate({ citizenId, scheme }) {
    // Hash immediately — raw ID never touches any further logic
    const citizenHash = registry.hashCitizenId(citizenId);

    // ── Gate 1: System Status ──────────────────────────────────────────────────
    const { status, budget } = state.getState();
    if (status === 'frozen') {
        return {
            approved: false,
            gate: 'System',
            reason: 'System is FROZEN due to a security or budget event. All transactions are blocked.',
        };
    }
    if (status === 'paused') {
        return {
            approved: false,
            gate: 'System',
            reason: 'System is PAUSED by administrator. No transactions are being processed.',
        };
    }

    // ── Gate 2: Replay / Duplicate Block ──────────────────────────────────────
    if (processedHashes.has(citizenHash)) {
        return {
            approved: false,
            gate: 'Replay',
            reason: 'Duplicate claim detected. This Citizen ID has already submitted a claim in this session.',
        };
    }

    // ── Gate 3: Eligibility ────────────────────────────────────────────────────
    const record = registry.lookup(citizenHash);

    if (!record) {
        return {
            approved: false,
            gate: 'Eligibility',
            reason: 'Citizen ID not found in the national registry.',
        };
    }

    if (record.account_status.toLowerCase() !== 'active') {
        return {
            approved: false,
            gate: 'Eligibility',
            reason: `Account is not active. Current status: "${record.account_status}".`,
        };
    }

    if (!record.aadhaar_linked) {
        return {
            approved: false,
            gate: 'Eligibility',
            reason: 'Aadhaar is not linked to this Jan-Dhan account. Linking is mandatory.',
        };
    }

    if (record.scheme_eligibility.toLowerCase() !== scheme.trim().toLowerCase()) {
        return {
            approved: false,
            gate: 'Eligibility',
            reason: `Scheme mismatch. Citizen is eligible for "${record.scheme_eligibility}", not "${scheme}".`,
        };
    }

    if (record.claim_count > 3) {
        return {
            approved: false,
            gate: 'Eligibility',
            reason: `Annual claim limit exceeded (Count: ${record.claim_count} / Max: 3). Referred for manual review.`,
        };
    }

    const amount = record.scheme_amount;

    // ── Gate 4: Budget ──────────────────────────────────────────────────────────
    if (budget <= 0) {
        state.freeze();
        return {
            approved: false,
            gate: 'Budget',
            reason: 'Budget exhausted (₹0 remaining). System auto-locked.',
        };
    }

    if (budget < amount) {
        return {
            approved: false,
            gate: 'Budget',
            reason: `Insufficient budget. Available: ₹${budget.toLocaleString('en-IN')}, Required: ₹${amount.toLocaleString('en-IN')}.`,
        };
    }

    // ── Gate 5: Frequency (30-day check) ───────────────────────────────────────
    if (record.last_claim_date) {
        const lastClaim = new Date(record.last_claim_date);
        const now = new Date();
        const diffDays = (now - lastClaim) / (1000 * 60 * 60 * 24);

        if (diffDays < 30) {
            const daysLeft = Math.ceil(30 - diffDays);
            return {
                approved: false,
                gate: 'Frequency',
                reason: `Frequency violation. Last claim was ${Math.floor(diffDays)} day(s) ago. Please wait ${daysLeft} more day(s).`,
            };
        }
    }

    // ── ALL GATES PASSED — APPROVE ─────────────────────────────────────────────
    state.deduct(amount);
    state.incrTx();
    processedHashes.add(citizenHash);

    const ledgerEntry = ledger.append({ citizenHash, scheme, amount });

    console.log(`[VALIDATOR] ✓ Approved | Scheme: ${scheme} | Amount: ₹${amount}`);

    return {
        approved: true,
        gate: 'Approved',
        reason: 'All validation gates passed. Transaction approved and recorded.',
        amount,
        scheme,
        timestamp: ledgerEntry.timestamp,
    };
}

module.exports = { validate };
