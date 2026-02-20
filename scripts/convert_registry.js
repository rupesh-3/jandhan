/**
 * convert_registry.js
 * Reads jan_dhan_registry_advanced.xlsx and outputs a clean registry.json
 * to the data/ folder. Normalises all fields and strips empty rows.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '..', 'jan_dhan_registry_advanced.xlsx');
const SHEET_NAME = 'Jan_Dhan_Registry_Advanced';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'registry.json');

// ── Read Excel ───────────────────────────────────────────────────────────────
const wb = XLSX.readFile(EXCEL_PATH, { cellDates: true });
const ws = wb.Sheets[SHEET_NAME];
if (!ws) { console.error(`Sheet "${SHEET_NAME}" not found.`); process.exit(1); }

const raw = XLSX.utils.sheet_to_json(ws, { raw: true, cellDates: true });

// ── Clean & Normalise ────────────────────────────────────────────────────────
const cleaned = raw
    .filter(row => row['Citizen_ID'])          // drop blank rows
    .map((row, idx) => {
        // Citizen_ID — always 12-char zero-padded string
        const citizenId = String(row['Citizen_ID']).trim().padStart(12, '0');

        // Account_Status
        const accountStatus = String(row['Account_Status'] || '').trim();

        // Aadhaar_Linked — handle Excel boolean or string
        const aaRaw = row['Aadhaar_Linked'];
        const aadhaarLinked = aaRaw === true || String(aaRaw).trim().toLowerCase() === 'true';

        // Scheme fields
        const schemeEligibility = String(row['Scheme_Eligibility'] || '').trim();
        const schemeAmount = parseFloat(row['Scheme_Amount']) || 0;

        // Claim_Count
        const claimCount = parseInt(row['Claim_Count']) || 0;

        // Last_Claim_Date — store as ISO string or null
        let lastClaimDate = null;
        if (row['Last_Claim_Date']) {
            const d = row['Last_Claim_Date'];
            const dt = d instanceof Date ? d : new Date(d);
            if (!isNaN(dt.getTime())) lastClaimDate = dt.toISOString();
        }

        // Optional fields
        const incomeTier = String(row['Income_Tier'] || '').trim();
        const regionCode = String(row['Region_Code'] || '').trim();

        return {
            citizen_id: citizenId,
            account_status: accountStatus,
            aadhaar_linked: aadhaarLinked,
            scheme_eligibility: schemeEligibility,
            scheme_amount: schemeAmount,
            claim_count: claimCount,
            last_claim_date: lastClaimDate,
            income_tier: incomeTier,
            region_code: regionCode,
        };
    });

// ── Write JSON ───────────────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleaned, null, 2), 'utf-8');

console.log(`✅  Converted ${cleaned.length} records → ${OUTPUT_PATH}`);

// Quick summary stats
const active = cleaned.filter(r => r.account_status.toLowerCase() === 'active').length;
const aadhaar = cleaned.filter(r => r.aadhaar_linked).length;
const schemes = [...new Set(cleaned.map(r => r.scheme_eligibility))].sort();
console.log(`   Active accounts   : ${active}`);
console.log(`   Aadhaar linked    : ${aadhaar}`);
console.log(`   Unique schemes    : ${schemes.join(', ')}`);
