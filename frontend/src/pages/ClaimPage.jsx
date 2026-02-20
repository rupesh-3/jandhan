import { useState, useEffect } from 'react'

const GATE_ICONS = {
    Input: '📋',
    System: '🔒',
    Replay: '🔄',
    Eligibility: '✅',
    Budget: '💰',
    Frequency: '📅',
    Approved: '✅',
}

export default function ClaimPage() {
    const [citizenId, setCitizenId] = useState('')
    const [scheme, setScheme] = useState('')
    const [schemes, setSchemes] = useState([])
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [sysStatus, setSysStatus] = useState(null)

    // Load scheme list and system status on mount
    useEffect(() => {
        fetch('/api/schemes')
            .then(r => r.json())
            .then(d => setSchemes(d.schemes || []))
            .catch(() => { })

        fetch('/api/admin/status')
            .then(r => r.json())
            .then(d => setSysStatus(d.status))
            .catch(() => { })
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setResult(null)

        try {
            const res = await fetch('/api/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ citizen_id: citizenId, scheme }),
            })
            const data = await res.json()
            setResult(data)
            // Refresh system status after claim
            fetch('/api/admin/status').then(r => r.json()).then(d => setSysStatus(d.status))
        } catch {
            setResult({ approved: false, gate: 'Network', reason: 'Unable to reach server. Please try again.' })
        } finally {
            setLoading(false)
            setCitizenId('') // Clear ID field after submission for security
        }
    }

    const isSystemBlocked = sysStatus && sysStatus !== 'active'

    return (
        <div className="page-container">
            {/* Page Header */}
            <div className="page-header">
                <h1 className="page-title">Citizen Benefit Claim Portal</h1>
                <p className="page-subtitle">
                    Submit your welfare benefit claim securely. All transactions are SHA-256 hashed and immutably recorded.
                </p>
            </div>

            {/* System Alert Banner */}
            {sysStatus && sysStatus !== 'active' && (
                <div className={`alert-banner ${sysStatus === 'frozen' ? 'alert-frozen' : 'alert-paused'}`}>
                    <span className="alert-icon">{sysStatus === 'frozen' ? '🔴' : '🟡'}</span>
                    <span>
                        System is currently <strong>{sysStatus.toUpperCase()}</strong>.
                        {sysStatus === 'frozen'
                            ? ' All transactions are blocked. Please contact the administrator.'
                            : ' Transaction processing is temporarily suspended.'}
                    </span>
                </div>
            )}

            <div className="content-grid">
                {/* Claim Form */}
                <div className="card claim-card">
                    <div className="card-header">
                        <span className="card-icon">📝</span>
                        <h2>Submit Claim</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="claim-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="citizenId">
                                Citizen ID (12-digit)
                            </label>
                            <input
                                id="citizenId"
                                type="text"
                                className="form-input"
                                placeholder="Enter your 12-digit Citizen ID"
                                value={citizenId}
                                onChange={e => setCitizenId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                maxLength={12}
                                pattern="\d{12}"
                                required
                                disabled={loading}
                            />
                            <span className="form-hint">Your ID will be cryptographically hashed and never stored in plain text.</span>
                        </div>

                        <div className="form-group">
                            <label className="form-label" htmlFor="scheme">
                                Benefit Scheme
                            </label>
                            <select
                                id="scheme"
                                className="form-input form-select"
                                value={scheme}
                                onChange={e => setScheme(e.target.value)}
                                required
                                disabled={loading}
                            >
                                <option value="">— Select a Scheme —</option>
                                {schemes.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="submit"
                            className={`btn-primary ${(loading || isSystemBlocked) ? 'btn-disabled' : ''}`}
                            disabled={loading || isSystemBlocked}
                        >
                            {loading ? (
                                <span className="btn-loading"><span className="spinner" />Processing…</span>
                            ) : isSystemBlocked ? (
                                'System Unavailable'
                            ) : (
                                'Submit Claim →'
                            )}
                        </button>
                    </form>
                </div>

                {/* Result Panel */}
                <div className="card result-card">
                    <div className="card-header">
                        <span className="card-icon">📊</span>
                        <h2>Validation Result</h2>
                    </div>

                    {!result && (
                        <div className="result-empty">
                            <span className="result-empty-icon">🛡</span>
                            <p>Submit a claim to see the validation result here.</p>
                            <p className="result-empty-sub">Your claim will pass through 5 security gates.</p>
                        </div>
                    )}

                    {result && (
                        <div className={`result-panel ${result.approved ? 'result-approved' : 'result-rejected'}`}>
                            <div className="result-status-row">
                                <span className="result-icon">{result.approved ? '✅' : '❌'}</span>
                                <span className="result-status-text">
                                    {result.approved ? 'APPROVED' : 'REJECTED'}
                                </span>
                            </div>

                            {result.gate && (
                                <div className="result-gate">
                                    <span className="gate-label">Gate Status:</span>
                                    <span className="gate-value">{GATE_ICONS[result.gate] || '⚙'} {result.gate}</span>
                                </div>
                            )}

                            <div className="result-reason">
                                <span className="reason-label">Details:</span>
                                <p className="reason-text">{result.reason}</p>
                            </div>

                            {result.approved && (
                                <div className="result-details">
                                    <div className="detail-row">
                                        <span>Scheme</span>
                                        <strong>{result.scheme}</strong>
                                    </div>
                                    <div className="detail-row">
                                        <span>Amount Disbursed</span>
                                        <strong className="amount">₹{Number(result.amount).toLocaleString('en-IN')}</strong>
                                    </div>
                                    <div className="detail-row">
                                        <span>Timestamp</span>
                                        <strong>{new Date(result.timestamp).toLocaleString('en-IN')}</strong>
                                    </div>
                                    <p className="ledger-note">📒 Transaction recorded in immutable ledger.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* How it works */}
            <div className="card info-card">
                <h3>🔐 5-Gate Validation Process</h3>
                <div className="gates-grid">
                    {[
                        { g: 'Gate 1', t: 'System Check', d: 'System must be Active' },
                        { g: 'Gate 2', t: 'Replay Block', d: 'No duplicate claims' },
                        { g: 'Gate 3', t: 'Eligibility', d: 'Active account, Aadhaar linked, scheme match' },
                        { g: 'Gate 4', t: 'Budget', d: 'Sufficient budget available' },
                        { g: 'Gate 5', t: 'Frequency', d: 'No claim in last 30 days' },
                    ].map(({ g, t, d }) => (
                        <div key={g} className="gate-chip">
                            <span className="gate-num">{g}</span>
                            <span className="gate-title">{t}</span>
                            <span className="gate-desc">{d}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
