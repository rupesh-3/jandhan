/**
 * server.js — Jan-Dhan Gateway Express Server
 * Initialises registry + ledger integrity, then serves API routes.
 * In production: also serves the React build as static files.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve React production build (frontend/dist)
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(DIST));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/claim', require('./routes/claim'));
app.use('/api/admin', require('./routes/admin'));

// Scheme list (populated from registry on startup)
app.get('/api/schemes', (req, res) => {
    const { getSchemes } = require('./services/registry');
    res.json({ schemes: getSchemes() });
});

// Catch-all → serve React app (handles client-side routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
});

// ── Startup Initialisation ──────────────────────────────────────────────────
const { loadRegistry } = require('./services/registry');
const { verifyIntegrity } = require('./services/ledger');

loadRegistry();          // Load Excel → in-memory hash map
verifyIntegrity();       // Verify ledger hash chain; freeze if tampered

app.listen(PORT, () => {
    console.log(`\n✅  Jan-Dhan Gateway running → http://localhost:${PORT}\n`);
});
