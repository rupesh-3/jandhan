/**
 * registry.js — Excel Registry Loader
 * Reads jan_dhan_registry_advanced.xlsx and builds an in-memory lookup map
 * keyed by SHA-256 hash of each Citizen_ID. Raw IDs are never stored.
 */

const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');

// Hash → record map
const registryMap = new Map();
const schemeSet = new Set();

const EXCEL_PATH = path.join(__dirname, '..', '..', 'jan_dhan_registry_advanced.xlsx');
const SHEET_NAME = 'Jan_Dhan_Registry_Advanced';

/**
 * Hash a Citizen ID string consistently.
 * Normalises to 12-digit zero-padded string before hashing.
 */
function hashCitizenId(rawId) {
    const normalised = String(rawId).trim().padStart(12, '0');
    return crypto.createHash('sha256').update(normalised).digest('hex');
}

/** Load and index the Excel registry. Called once at server startup. */
function loadRegistry() {
    try {
        const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
        const ws = wb.Sheets[SHEET_NAME];
        if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found in Excel file.`);

        const rows = XLSX.utils.sheet_to_json(ws, { raw: true, cellDates: true });

        rows.forEach((row, idx) => {
            const rawId = row['Citizen_ID'];
            if (!rawId) return;

            const hash = hashCitizenId(rawId);

            // Normalise Aadhaar_Linked — may be Excel boolean (true/false) or string
            const aadhaarRaw = row['Aadhaar_Linked'];
            const aadhaarLinked =
                aadhaarRaw === true ||
                String(aadhaarRaw).trim().toLowerCase() === 'true';

            // Normalise Last_Claim_Date — could be JS Date (cellDates:true) or string
            let lastClaimDate = null;
            if (row['Last_Claim_Date']) {
                const d = row['Last_Claim_Date'];
                lastClaimDate = d instanceof Date ? d : new Date(d);
                if (isNaN(lastClaimDate.getTime())) lastClaimDate = null;
            }

            const schemeEligibility = String(row['Scheme_Eligibility'] || '').trim();
            const schemeAmount = parseFloat(row['Scheme_Amount']) || 0;

            registryMap.set(hash, {
                account_status: String(row['Account_Status'] || '').trim(),
                aadhaar_linked: aadhaarLinked,
                scheme_eligibility: schemeEligibility,
                scheme_amount: schemeAmount,
                last_claim_date: lastClaimDate,
                claim_count: parseInt(row['Claim_Count']) || 0,
                income_tier: String(row['Income_Tier'] || '').trim(),
                region_code: String(row['Region_Code'] || '').trim(),
            });

            if (schemeEligibility) schemeSet.add(schemeEligibility);
        });

        console.log(`[REGISTRY] ✓ Loaded ${registryMap.size} records from Excel.`);
        console.log(`[REGISTRY] ✓ Available schemes: ${[...schemeSet].join(', ')}`);
    } catch (err) {
        console.error('[REGISTRY] ✗ Failed to load registry:', err.message);
        process.exit(1);
    }
}

/** Lookup a citizen by their SHA-256 hash. Returns record or null. */
function lookup(hash) {
    return registryMap.get(hash) || null;
}

/** Return sorted list of unique scheme names from registry. */
function getSchemes() {
    return [...schemeSet].sort();
}

module.exports = { loadRegistry, lookup, getSchemes, hashCitizenId };
