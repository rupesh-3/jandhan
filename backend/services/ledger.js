/**
 * ledger.js — Immutable Hash-Linked Ledger
 *
 * Each approved transaction is appended as a pipe-delimited line:
 *   Timestamp|CitizenHash|Scheme|Amount|PreviousHash|CurrentHash
 *
 * CurrentHash = SHA256(Timestamp + CitizenHash + Scheme + Amount + PreviousHash)
 *
 * After every write, the full-file SHA-256 is stored in ledger_meta.json.
 * On startup (and on each integrity check), the stored hash is compared with
 * the recomputed one. Any mismatch → system freezes immediately.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const state = require('./state');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.txt');
const META_FILE = path.join(DATA_DIR, 'ledger_meta.json');

// Genesis / empty-ledger sentinel hash
const GENESIS_HASH = '0'.repeat(64);

// Last approved hash held in memory (avoids re-reading file on every append)
let lastHash = GENESIS_HASH;
let initialized = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function sha256(...parts) {
    return crypto.createHash('sha256').update(parts.join('')).digest('hex');
}

function computeFileHash() {
    if (!fs.existsSync(LEDGER_FILE)) return GENESIS_HASH;
    const content = fs.readFileSync(LEDGER_FILE, 'utf-8');
    return sha256(content);
}

function saveMeta(fileHash) {
    fs.writeFileSync(META_FILE, JSON.stringify({ fileHash }), 'utf-8');
}

function loadMeta() {
    if (!fs.existsSync(META_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify ledger integrity:
 *  1. Check stored file hash vs actual file hash.
 *  2. Walk the hash chain to confirm no line was altered.
 * Freezes system immediately on any mismatch.
 * @returns {boolean} true if valid (or ledger doesn't exist yet)
 */
function verifyIntegrity() {
    ensureDataDir();

    // No ledger yet — nothing to verify
    if (!fs.existsSync(LEDGER_FILE)) {
        initialized = true;
        return true;
    }

    // Step 1: file-level hash check
    const meta = loadMeta();
    const actualFileHash = computeFileHash();

    if (meta && meta.fileHash !== actualFileHash) {
        console.error('[LEDGER] ✗ File hash mismatch — TAMPERING DETECTED. Freezing system.');
        state.freeze();
        return false;
    }

    // Step 2: walk the hash chain
    const lines = fs.readFileSync(LEDGER_FILE, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    let prevHash = GENESIS_HASH;

    for (let i = 0; i < lines.length; i++) {
        const parts = lines[i].split('|');
        if (parts.length !== 6) {
            console.error(`[LEDGER] ✗ Malformed line ${i + 1} — Freezing system.`);
            state.freeze();
            return false;
        }

        const [timestamp, citizenHash, scheme, amount, storedPrevHash, storedCurrHash] = parts;
        const expectedCurrHash = sha256(timestamp, citizenHash, scheme, amount, storedPrevHash);

        if (storedPrevHash !== prevHash || storedCurrHash !== expectedCurrHash) {
            console.error(`[LEDGER] ✗ Hash chain broken at line ${i + 1} — Freezing system.`);
            state.freeze();
            return false;
        }

        prevHash = storedCurrHash;
    }

    lastHash = prevHash;
    initialized = true;
    console.log(`[LEDGER] ✓ Integrity verified. ${lines.length} transaction(s) on record.`);
    return true;
}

/**
 * Append an approved transaction to the ledger.
 * @param {{ citizenHash: string, scheme: string, amount: number }} entry
 * @returns {{ timestamp: string, currentHash: string }}
 */
function append({ citizenHash, scheme, amount }) {
    ensureDataDir();
    if (!initialized) verifyIntegrity();

    const timestamp = new Date().toISOString();
    const prevHash = lastHash;
    const currentHash = sha256(timestamp, citizenHash, scheme, String(amount), prevHash);

    const line = `${timestamp}|${citizenHash}|${scheme}|${amount}|${prevHash}|${currentHash}\n`;
    fs.appendFileSync(LEDGER_FILE, line, 'utf-8');

    // Update in-memory last hash
    lastHash = currentHash;

    // Recompute and save file-level hash
    const fileHash = computeFileHash();
    saveMeta(fileHash);

    console.log(`[LEDGER] ✓ Transaction appended. CurrentHash: ${currentHash.slice(0, 16)}...`);
    return { timestamp, currentHash };
}

/**
 * Return the last n ledger lines as structured objects.
 * @param {number} n
 */
function getLastLines(n = 20) {
    if (!fs.existsSync(LEDGER_FILE)) return [];
    const lines = fs.readFileSync(LEDGER_FILE, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    return lines.slice(-n).map(line => {
        const [timestamp, citizenHash, scheme, amount, prevHash, currHash] = line.split('|');
        return {
            timestamp,
            citizenHash: citizenHash ? citizenHash.slice(0, 12) + '...' : '', // truncate for display
            scheme,
            amount,
            prevHash: prevHash ? prevHash.slice(0, 12) + '...' : '',
            currHash: currHash ? currHash.slice(0, 12) + '...' : '',
        };
    });
}

module.exports = { verifyIntegrity, append, getLastLines };
