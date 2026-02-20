import { useState, useEffect, useCallback } from 'react'

const STATUS_META = {
    active: { label: 'ACTIVE', icon: '🟢', cls: 'status-active' },
    paused: { label: 'PAUSED', icon: '🟡', cls: 'status-paused' },
    frozen: { label: 'FROZEN', icon: '🔴', cls: 'status-frozen' },
}

function StatCard({ icon, label, value, sub, cls }) {
    return (
        <div className={`stat-card ${cls || ''}`}>
            <span className="stat-icon">{icon}</span>
            <div className="stat-body">
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}</span>
                {sub && <span className="stat-sub">{sub}</span>}
            </div>
        </div>
    )
}

export default function AdminPage() {
    const [state, setState] = useState(null)
    const [ledger, setLedger] = useState([])
    const [actionMsg, setActionMsg] = useState(null)
    const [loading, setLoading] = useState(false)

    const fetchStatus = useCallback(async () => {
        try {
            const [statusRes, ledgerRes] = await Promise.all([
                fetch('/api/admin/status'),
                fetch('/api/admin/ledger'),
            ])
            const statusData = await statusRes.json()
            const ledgerData = await ledgerRes.json()
            setState(statusData)
            setLedger(ledgerData.entries || [])
        } catch {
            // Network error — ignore silently
        }
    }, [])

    // Initial fetch + auto-refresh every 5 seconds
    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [fetchStatus])

    const handleAction = async (action) => {
        setLoading(true)
        setActionMsg(null)
        try {
            const res = await fetch(`/api/admin/${action}`, { method: 'POST' })
            const data = await res.json()
            setActionMsg({ ok: data.success, text: `System ${data.status?.toUpperCase() || action + 'd'} successfully.` })
            fetchStatus()
        } catch {
            setActionMsg({ ok: false, text: 'Action failed. Server unreachable.' })
        } finally {
            setLoading(false)
        }
    }

    const sm = state ? (STATUS_META[state.status] || STATUS_META.active) : null
    const budgetPct = state ? Math.round((state.budget / (state.initialBudget || 1000000)) * 100) : 0

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Admin Control Dashboard</h1>
                <p className="page-subtitle">
                    System monitoring, emergency controls, and ledger audit panel. Auto-refreshes every 5 seconds.
                </p>
            </div>

            {/* Status Cards */}
            <div className="stats-grid">
                <div className={`stat-card stat-card-status ${sm?.cls}`}>
                    <span className="stat-icon">{sm?.icon || '⚙'}</span>
                    <div className="stat-body">
                        <span className="stat-label">System Status</span>
                        <span className="stat-value">{sm?.label || '—'}</span>
                    </div>
                </div>

                <StatCard
                    icon="💰"
                    label="Budget Remaining"
                    value={state ? `₹${state.budget.toLocaleString('en-IN')}` : '—'}
                    sub={`of ₹${(state?.initialBudget || 1000000).toLocaleString('en-IN')} (${budgetPct}%)`}
                    cls={budgetPct < 20 ? 'stat-warning' : ''}
                />

                <StatCard
                    icon="📊"
                    label="Total Transactions"
                    value={state ? state.transactionCount : '—'}
                    sub="Approved this session"
                />

                <div className={`stat-card ${state?.ledgerIntegrity === false ? 'stat-danger' : 'stat-success'}`}>
                    <span className="stat-icon">{state?.ledgerIntegrity === false ? '⚠️' : '🔒'}</span>
                    <div className="stat-body">
                        <span className="stat-label">Ledger Integrity</span>
                        <span className="stat-value">{state?.ledgerIntegrity === false ? 'TAMPERED' : 'VALID'}</span>
                    </div>
                </div>
            </div>

            {/* Budget Progress Bar */}
            {state && (
                <div className="card budget-card">
                    <h3>Budget Utilisation</h3>
                    <div className="budget-bar-wrap">
                        <div
                            className={`budget-bar-fill ${budgetPct < 20 ? 'bar-red' : budgetPct < 50 ? 'bar-amber' : 'bar-green'}`}
                            style={{ width: `${budgetPct}%` }}
                        />
                    </div>
                    <div className="budget-bar-labels">
                        <span>₹0</span>
                        <span className={budgetPct < 20 ? 'text-danger' : ''}>
                            ₹{state.budget.toLocaleString('en-IN')} remaining ({budgetPct}%)
                        </span>
                        <span>₹{(state.initialBudget || 1000000).toLocaleString('en-IN')}</span>
                    </div>
                </div>
            )}

            {/* Kill-Switch Controls */}
            <div className="card control-card">
                <div className="card-header">
                    <span className="card-icon">🎛</span>
                    <h2>Emergency Controls</h2>
                </div>

                {actionMsg && (
                    <div className={`action-msg ${actionMsg.ok ? 'action-ok' : 'action-err'}`}>
                        {actionMsg.text}
                    </div>
                )}

                <div className="control-buttons">
                    <button
                        className="btn-danger"
                        onClick={() => handleAction('pause')}
                        disabled={loading || state?.status !== 'active'}
                    >
                        🛑 Emergency Pause
                    </button>
                    <button
                        className="btn-success"
                        onClick={() => handleAction('resume')}
                        disabled={loading || state?.status !== 'paused'}
                    >
                        ▶ Resume System
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={fetchStatus}
                        disabled={loading}
                    >
                        🔄 Refresh Now
                    </button>
                </div>

                {state?.status === 'frozen' && (
                    <div className="frozen-notice">
                        ⚠️ System is <strong>FROZEN</strong> due to a security event (ledger tampering or budget exhaustion).
                        A system restart is required to reset the state. No transactions can be processed.
                    </div>
                )}
            </div>

            {/* Ledger Table */}
            <div className="card ledger-card">
                <div className="card-header">
                    <span className="card-icon">📒</span>
                    <h2>Recent Ledger Entries (Last 20)</h2>
                </div>

                {ledger.length === 0 ? (
                    <div className="ledger-empty">No transactions recorded yet.</div>
                ) : (
                    <div className="table-wrapper">
                        <table className="ledger-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Timestamp (IST)</th>
                                    <th>Citizen Hash (truncated)</th>
                                    <th>Scheme</th>
                                    <th>Amount</th>
                                    <th>Curr. Hash (truncated)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...ledger].reverse().map((entry, i) => (
                                    <tr key={i}>
                                        <td>{ledger.length - i}</td>
                                        <td>{new Date(entry.timestamp).toLocaleString('en-IN')}</td>
                                        <td><code className="hash-code">{entry.citizenHash}</code></td>
                                        <td>{entry.scheme}</td>
                                        <td>₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                                        <td><code className="hash-code">{entry.currHash}</code></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
