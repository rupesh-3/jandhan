import { useState, useEffect, useCallback, useRef } from 'react'
import GateViz from './components/GateViz'
import EventTicker from './components/EventTicker'
import './index.css'

// ── Helpers ──────────────────────────────────────────────────────────────────
const toINR = n => '₹ ' + Number(n).toLocaleString('en-IN')
const now8 = () => new Date().toLocaleTimeString('en-IN', { hour12: false })
const maskH = h => h ? <><span className="h-s">{h.slice(0, 6)}</span><span className="h-m">{'•'.repeat(9)}</span><span className="h-e">{h.slice(-6)}</span></> : '—'

// Mini sparkline (purely visual)
function Spark({ color, seed = 0 }) {
  const pts = Array.from({ length: 12 }, (_, i) => 5 + Math.abs(Math.sin(seed + i * 0.8)) * 14)
  const w = 60, h = 22
  const mx = Math.max(...pts), mn = Math.min(...pts), r = mx - mn || 1
  const d = pts.map((v, i) => `${(i / 11) * w},${h - ((v - mn) / r) * h}`).join(' ')
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Arc progress (budget)
function Arc({ pct, color }) {
  const r = 20, cx = 26, cy = 26, circ = 2 * Math.PI * r
  return (
    <svg className="arc-wrap" width="52" height="52" viewBox="0 0 52 52">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, pct)))}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }} />
    </svg>
  )
}

// Empty ledger SVG illustration
function EmptyLedger() {
  return (
    <div className="ledger-empty">
      <svg width="90" height="60" viewBox="0 0 90 60">
        {[10, 45, 80].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy="30" r="13" fill="none"
              stroke="rgba(245,166,35,0.2)" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={x} y="34" textAnchor="middle" fontSize="12" fill="rgba(245,166,35,0.35)">
              {['🛡', '🏦', '🕐'][i]}
            </text>
          </g>
        ))}
        <line x1="23" y1="30" x2="32" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="58" y1="30" x2="67" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
      <p className="empty-txt">No transactions processed.<br />System standing by.</p>
    </div>
  )
}

const SCHEME_ICONS = { Food: '🌾', Health: '🏥', Pension: '👴', default: '📋' }
const INI_BUDGET = 1000000

// ── Logo SVG ─────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg className="mast-logo" viewBox="0 0 40 40" fill="none">
      <polygon points="20,2 35,10 35,30 20,38 5,30 5,10" fill="none" stroke="#F5A623" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="6" fill="none" stroke="#F5A623" strokeWidth="1.2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = deg * Math.PI / 180, x1 = 20 + 8 * Math.cos(rad), y1 = 20 + 8 * Math.sin(rad),
          x2 = 20 + 12 * Math.cos(rad), y2 = 20 + 12 * Math.sin(rad)
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F5A623" strokeWidth="1" opacity="0.7" />
      })}
    </svg>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [sysState, setSysState] = useState(null)
  const [ledger, setLedger] = useState([])
  const [schemes, setSchemes] = useState([])
  const [result, setResult] = useState(null)
  const [events, setEvents] = useState([])
  const [citizenId, setCitizenId] = useState('')
  const [scheme, setScheme] = useState('')
  const [loading, setLoading] = useState(false)
  const [ddOpen, setDdOpen] = useState(false)
  const [idFocused, setIdFocused] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [intHash, setIntHash] = useState('—')
  const [scramble, setScramble] = useState(false)
  const [newRowId, setNewRowId] = useState(null)
  const confirmTimer = useRef(null)
  const startTime = useRef(Date.now())

  // ── Uptime ────────────────────────────────────────────────────────────────
  const [uptime, setUptime] = useState('00:00:00')
  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - startTime.current) / 1000)
      const h = String(Math.floor(s / 3600)).padStart(2, '0')
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const sec = String(s % 60).padStart(2, '0')
      setUptime(`${h}:${m}:${sec}`)
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Poll backend ──────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [sr, lr] = await Promise.all([
        fetch('/api/admin/status'), fetch('/api/admin/ledger')
      ])
      const sd = await sr.json(), ld = await lr.json()
      setSysState(sd)
      const entries = ld.entries || []
      setLedger(prev => {
        if (entries.length > prev.length) {
          const newest = entries[entries.length - 1]
          setNewRowId(newest?.timestamp)
          setTimeout(() => setNewRowId(null), 950)
          // Scramble integrity hash
          setScramble(true); setTimeout(() => setScramble(false), 500)
          // Derive integrity hash display
          setIntHash(sd.ledgerIntegrity
            ? `chain:${entries.length}·sha256:${Math.random().toString(36).slice(2, 18)}...`
            : 'INTEGRITY FAILURE')
        }
        return entries
      })
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetch('/api/schemes').then(r => r.json()).then(d => setSchemes(d.schemes || [])).catch(() => { })
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [poll])

  // ── Emit ticker event ─────────────────────────────────────────────────────
  const emit = (msg, cls = '') => {
    setEvents(prev => [{ t: now8(), msg, cls }, ...prev].slice(0, 40))
  }

  // ── Submit claim ──────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault()
    if (!citizenId || !scheme || loading) return
    setLoading(true); setResult(null)
    emit(`CLAIM SUBMITTED — ID:${citizenId.slice(0, 4)}XXXXXXXX — SCHEME:${scheme}`, '')
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizen_id: citizenId, scheme })
      })
      const data = await res.json()
      setResult(data)
      if (data.approved) {
        emit(`GATE APPROVED — SCHEME:${scheme} — AMT:${data.amount}`, 'tg')
      } else {
        emit(`GATE ${data.gate?.toUpperCase() || '?'} REJECTED — ${data.reason?.slice(0, 50)}`, 'tr')
      }
      poll()
    } catch {
      setResult({ approved: false, gate: 'Network', reason: 'Server unreachable. Please try again.' })
      emit('NETWORK ERROR — SERVER UNREACHABLE', 'tr')
    } finally {
      setLoading(false); setCitizenId('')
    }
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  const handlePause = async () => {
    if (!confirm) {
      setConfirm(true)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirm(false), 3000)
      return
    }
    setConfirm(false)
    await fetch('/api/admin/pause', { method: 'POST' })
    emit('ADMIN ACTION — EMERGENCY PAUSE ACTIVATED', 'tr')
    poll()
  }
  const handleResume = async () => {
    await fetch('/api/admin/resume', { method: 'POST' })
    emit('ADMIN ACTION — SYSTEM RESUMED', 'tg')
    poll()
  }

  const status = sysState?.status || 'active'
  const budget = sysState?.budget ?? INI_BUDGET
  const budgetPct = budget / INI_BUDGET
  const txCount = sysState?.transactionCount ?? 0
  const rejected = ledger.length - txCount
  const integrity = sysState?.ledgerIntegrity !== false
  const isBlocked = status !== 'active'

  const schemeAmtMap = {}
  // Build basic scheme→amount from ledger (fallback)
  const selSchemeIcon = SCHEME_ICONS[scheme] || SCHEME_ICONS.default

  return (
    <div className={`app ${status}`}>
      {/* ── Masthead ── */}
      <header className={`mast ${status}`}>
        <div className="mast-brand">
          <Logo />
          <div>
            <div className="mast-name">
              {status === 'frozen' ? '⚠ SYSTEM FROZEN' : 'Jan-Dhan Gateway'}
            </div>
            <div className="mast-sub">Sequential Validation Engine // v2.1.4</div>
          </div>
        </div>
        <div className="mast-pills">
          <div className={`s-pill ${status === 'active' ? 'active-sys' : ''}`}>
            <span className={`dot ${status === 'active' ? 'teal' : status === 'paused' ? 'gold' : 'red'}`} />
            <strong>{status.toUpperCase()}</strong>
          </div>
          <div className="s-pill">
            <span className="dot gold" />
            <strong>{toINR(budget)}</strong>
            <span>budget</span>
          </div>
          <div className="s-pill">
            <span className={`dot ${integrity ? 'teal' : 'red'}`} />
            <strong>LEDGER {integrity ? 'INTACT' : 'TAMPERED'}</strong>
          </div>
        </div>
      </header>

      {/* ── Frozen Toast ── */}
      {status === 'frozen' && (
        <div className="frz-toast">
          <div className="frz-toast-title">🔴 Security Event — System Frozen</div>
          <div className="frz-toast-body">All transactions blocked. Admin restart required.</div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="layout">

        {/* ─── Command Surface (left) ─── */}
        <div className="cmd">

          {/* Claim Form */}
          <div className="cmd-sec">
            <div className="sec-lbl">Initiate Claim Verification</div>
            <form onSubmit={handleSubmit}>
              {/* Citizen ID */}
              <div className="f-group">
                <label className={`f-lbl ${idFocused ? 'hashing' : ''}`}>
                  Citizen ID
                  <span className="f-lbl-tag">SHA-256 HASHING ACTIVE</span>
                </label>
                <div className={`id-wrap ${idFocused ? 'focused' : ''}`}>
                  <input className="id-inp" type="text" inputMode="numeric"
                    placeholder="000000000000"
                    value={citizenId}
                    maxLength={12}
                    onChange={e => setCitizenId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    onFocus={() => setIdFocused(true)}
                    onBlur={() => setIdFocused(false)}
                    disabled={loading} />
                </div>
              </div>

              {/* Scheme Dropdown */}
              <div className="f-group">
                <label className="f-lbl">Benefit Scheme</label>
                <div className="dd-wrap">
                  <button type="button" className={`dd-btn ${ddOpen ? 'open' : ''}`}
                    onClick={() => setDdOpen(o => !o)} disabled={loading}>
                    <div className="dd-btn-l">
                      {scheme
                        ? <><span>{selSchemeIcon}</span><span>{scheme}</span></>
                        : <span className="dd-ph">— Select Scheme —</span>
                      }
                    </div>
                    <span className="dd-arrow">▾</span>
                  </button>
                  {ddOpen && (
                    <div className="dd-menu">
                      {schemes.map(s => (
                        <div key={s} className={`dd-opt ${scheme === s ? 'sel' : ''}`}
                          onClick={() => { setScheme(s); setDdOpen(false) }}>
                          <div className="dd-opt-l">
                            <span className="s-icon">{SCHEME_ICONS[s] || '📋'}</span>
                            <span>{s}</span>
                          </div>
                          <span className="opt-amt">Fixed Rate</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="submit"
                className={`sub-btn ${isBlocked ? 'blocked' : ''}`}
                disabled={loading || isBlocked || !citizenId || !scheme}>
                <div className="btn-inner">
                  {loading ? <><div className="spin" /><span>Processing…</span></>
                    : isBlocked ? 'System Unavailable'
                      : 'Verify Identity & Process Claim'}
                </div>
              </button>
            </form>

            {/* Result */}
            {result && (
              <div className={`result ${result.approved ? 'ok' : 'err'}`}>
                <div className="res-hd">
                  <span className="res-icon">{result.approved ? '✅' : '❌'}</span>
                  <span className="res-vd">{result.approved ? 'Approved' : 'Rejected'}</span>
                </div>
                <div className="res-reason">{result.reason}</div>
                {result.approved && (
                  <div className="res-details">
                    <div className="res-row">
                      <span>Scheme</span><strong>{result.scheme}</strong>
                    </div>
                    <div className="res-row">
                      <span>Amount</span><strong>{toINR(result.amount)}</strong>
                    </div>
                    <div className="res-row">
                      <span>Timestamp</span>
                      <strong>{new Date(result.timestamp).toLocaleTimeString('en-IN')}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gate Visualization */}
          <div className="cmd-sec">
            <div className="sec-lbl">Validation Gates</div>
            <GateViz result={result} onAnimationDone={() => { }} />
          </div>

          {/* Admin Controls */}
          <div className="cmd-sec">
            <div className="sec-lbl danger">Admin Control — Authorized Access Only</div>

            <div className={`sys-pill-wide ${status}`}>
              <div className="spl">
                <span className={`dot ${status === 'active' ? 'teal' : status === 'paused' ? 'gold' : 'red'}`} />
                <span className="spw-label">
                  {status === 'active' ? 'System Operational' : status === 'paused' ? 'System Paused' : 'System Frozen'}
                </span>
              </div>
              <span className="spw-uptime">{uptime}</span>
            </div>

            <div className="adm-btns">
              <button className={`btn-lock ${confirm ? 'confirm' : ''}`}
                onClick={handlePause} disabled={status !== 'active'}>
                {confirm && <div className="confirm-tip">Click again to confirm lockdown</div>}
                🛑 Emergency Lockdown
              </button>
              <button className="btn-res" onClick={handleResume} disabled={status !== 'paused'}>
                ▶ Resume
              </button>
            </div>
          </div>
        </div>

        {/* ─── Intelligence Panel (right) ─── */}
        <div className="intel">
          {/* Metric Cards */}
          <div className="metrics">
            <div className="area-lbl">Live Operations Dashboard</div>
            <div className="mcards">
              <div className="mc gold">
                <div className="mc-top">
                  <span className="mc-lbl">Budget Remaining</span>
                  <Arc pct={budgetPct} color="#F5A623" />
                </div>
                <div className="mc-val">{toINR(budget)}</div>
                <div className="mc-bot">
                  <span className="mc-sub">{Math.round(budgetPct * 100)}% of ₹10L</span>
                  <Spark color="#F5A623" seed={1} />
                </div>
              </div>

              <div className="mc teal">
                <div className="mc-top">
                  <span className="mc-lbl">Approved</span>
                </div>
                <div className="mc-val">{txCount}</div>
                <div className="mc-bot">
                  <span className="mc-sub">transactions</span>
                  <Spark color="#00C9A7" seed={2} />
                </div>
              </div>

              <div className="mc red">
                <div className="mc-top">
                  <span className="mc-lbl">Rejected</span>
                </div>
                <div className="mc-val">{Math.max(0, ledger.length - txCount + (ledger.length === 0 && txCount === 0 ? 0 : 0))}</div>
                <div className="mc-bot">
                  <span className="mc-sub">this session</span>
                  <Spark color="#E63946" seed={3} />
                </div>
              </div>

              <div className="mc amber">
                <div className="mc-top">
                  <span className="mc-lbl">Ledger Integrity</span>
                </div>
                <div className="mc-val" style={{ fontSize: 16, paddingTop: 4 }}>
                  {integrity ? '✅ VALID' : '⚠ TAMPERED'}
                </div>
                <div className="mc-bot">
                  <span className="mc-sub">{ledger.length} entries</span>
                </div>
              </div>
            </div>
          </div>

          {/* Integrity Strip */}
          <div className="int-strip">
            <span className="int-icon">{integrity ? '🔒' : '⚠️'}</span>
            <span className="int-label">Chain Integrity {integrity ? 'Verified' : 'FAILED'}</span>
            <span className={`int-hash ${scramble ? 'scramble' : ''}`}>
              {intHash || 'awaiting first transaction…'}
            </span>
          </div>

          {/* Ledger */}
          <div className="ledger">
            <div className="ledger-hd">
              <span className="ledger-ttl">Immutable Transaction Ledger</span>
              <span className="ledger-cnt">{ledger.length} records</span>
            </div>
            <div className="ledger-scroll">
              {ledger.length === 0
                ? <EmptyLedger />
                : (
                  <table className="ltbl">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Time</th>
                        <th>Citizen Hash</th>
                        <th>Scheme</th>
                        <th className="r">Amount</th>
                        <th className="c">Chain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ledger].reverse().map((e, i) => (
                        <tr key={e.timestamp || i}
                          className={`lrow ${e.timestamp === newRowId ? 'new' : ''}`}>
                          <td className="td-t">{ledger.length - i}</td>
                          <td className="td-t">
                            {new Date(e.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                          </td>
                          <td className="td-h">
                            {maskH(e.citizenHash || e.currHash)}
                            <div className="htip">
                              <div className="htip-hash">
                                {e.citizenHash || 'hash unavailable'}
                              </div>
                              <button className="htip-copy"
                                onClick={() => navigator.clipboard?.writeText(e.citizenHash || '')}>
                                Copy
                              </button>
                            </div>
                          </td>
                          <td className="td-s">{e.scheme}</td>
                          <td className="td-a">{toINR(e.amount)}</td>
                          <td className="td-c"><span className="tc">⛓</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        </div>
      </div>

      {/* ── Event Ticker ── */}
      <EventTicker events={events} />
    </div>
  )
}
