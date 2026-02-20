import { useState, useEffect, useCallback, useRef } from 'react'
import GateViz from './components/GateViz'
import EventTicker from './components/EventTicker'
import './index.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const INI_BUDGET = 1_000_000
const SCHEME_ICON = { Food: '🌾', Health: '🏥', Pension: '👴' }
const toINR = n => '₹\u00a0' + Number(n ?? 0).toLocaleString('en-IN')
const ts8 = () => new Date().toLocaleTimeString('en-IN', { hour12: false })

// ── Helpers ───────────────────────────────────────────────────────────────────
function Spark({ color, seed }) {
  const pts = Array.from({ length: 12 }, (_, i) => 4 + Math.abs(Math.sin(seed * 2 + i * 0.9)) * 14)
  const w = 58, h = 20, mx = Math.max(...pts), mn = Math.min(...pts), rng = mx - mn || 1
  const d = pts.map((v, i) => `${(i / 11) * w},${h - ((v - mn) / rng) * h}`).join(' ')
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={d} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Arc({ pct, color }) {
  const r = 19, cx = 25, cy = 25, circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(1, pct ?? 1)))
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="3" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={off}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .7s ease' }} />
    </svg>
  )
}

function Logo() {
  return (
    <svg className="mast-logo" viewBox="0 0 38 38" fill="none">
      <polygon points="19,2 34,10 34,28 19,36 4,28 4,10"
        stroke="#F5A623" strokeWidth="1.5" />
      <circle cx="19" cy="19" r="5.5" stroke="#F5A623" strokeWidth="1.2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const a = deg * Math.PI / 180
        return (
          <line key={i}
            x1={19 + 7.5 * Math.cos(a)} y1={19 + 7.5 * Math.sin(a)}
            x2={19 + 11 * Math.cos(a)} y2={19 + 11 * Math.sin(a)}
            stroke="#F5A623" strokeWidth="1" opacity=".65" />
        )
      })}
    </svg>
  )
}

function EmptyLedger() {
  return (
    <div className="ledger-empty">
      <svg width="100" height="56" viewBox="0 0 100 56">
        {[12, 50, 88].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy="28" r="13" fill="none"
              stroke="rgba(245,166,35,.2)" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={x} y="33" textAnchor="middle" fontSize="13"
              fill="rgba(245,166,35,.35)">
              {['🛡', '🏦', '🕐'][i]}
            </text>
          </g>
        ))}
        <line x1="25" y1="28" x2="37" y2="28" stroke="rgba(255,255,255,.1)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="63" y1="28" x2="75" y2="28" stroke="rgba(255,255,255,.1)" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
      <p className="empty-txt">No transactions processed.<br />System standing by.</p>
    </div>
  )
}

// Render a masked hash: first6•••••••••last6
function HashCell({ full, short }) {
  const display = short || full || ''
  // Show abbreviated: first 6 chars + bullets + last 6 chars
  const s = display.replace(/\.*$/, '') // strip trailing dots from server truncation
  const maskEl = s.length >= 12
    ? <><span className="hs">{s.slice(0, 6)}</span>
      <span className="hm">{'•'.repeat(9)}</span>
      <span className="he">{s.slice(-6)}</span></>
    : <span className="hs">{display}</span>

  return (
    <td className="td-h hash-cell">
      {maskEl}
      {full && (
        <div className="hash-tip">
          <div className="ht-hash">{full}</div>
          <button className="ht-copy"
            onClick={() => navigator.clipboard?.writeText(full)}>
            📋 Copy
          </button>
        </div>
      )}
    </td>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // System state
  const [sysState, setSysState] = useState(null)
  const [ledger, setLedger] = useState([])
  const [schemes, setSchemes] = useState([])

  // Claim form
  const [citizenId, setCitizenId] = useState('')
  const [scheme, setScheme] = useState('')
  const [ddOpen, setDdOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  // Admin
  const [confirm, setConfirm] = useState(false)
  const confirmRef = useRef(null)

  // Counters (tracked client-side for accuracy)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)

  // Ticker events
  const [events, setEvents] = useState([])
  const emit = (msg, cls = '') =>
    setEvents(prev => [{ t: ts8(), msg, cls }, ...prev].slice(0, 60))

  // Integrity hash display
  const [ihash, setIhash] = useState('awaiting first transaction…')
  const [ihashSc, setIhashSc] = useState(false)

  // New row highlight
  const [newTs, setNewTs] = useState(null)

  // Uptime counter
  const startRef = useRef(Date.now())
  const [uptime, setUptime] = useState('00:00:00')
  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000)
      setUptime(
        [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
          .map(n => String(n).padStart(2, '0')).join(':')
      )
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Poll backend ────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const [sr, lr] = await Promise.all([
        fetch('/api/admin/status'),
        fetch('/api/admin/ledger'),
      ])
      if (!sr.ok || !lr.ok) return
      const sd = await sr.json()
      const ld = await lr.json()
      setSysState(sd)
      const entries = Array.isArray(ld.entries) ? ld.entries : []
      setLedger(prev => {
        if (entries.length > prev.length) {
          const newest = entries[entries.length - 1]
          setNewTs(newest?.timestamp)
          setTimeout(() => setNewTs(null), 1000)
          setIhashSc(true)
          setTimeout(() => setIhashSc(false), 500)
          const fakeHex = Array.from({ length: 8 }, () =>
            Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
          ).join('')
          setIhash(`sha256·${fakeHex}`)
        }
        return entries
      })
      // Sync approved count from server if available
      if (sd.transactionCount !== undefined) setApproved(sd.transactionCount)
    } catch { /* silent - backend may be starting up */ }
  }, [])

  // Load schemes + start polling
  useEffect(() => {
    fetch('/api/schemes')
      .then(r => r.json())
      .then(d => setSchemes(d.schemes || []))
      .catch(() => setSchemes(['Food', 'Health', 'Pension']))
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [poll])

  // Close dropdown on outside click
  useEffect(() => {
    const close = () => setDdOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // ── Submit claim ─────────────────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault()
    if (!citizenId || !scheme || loading) return
    setLoading(true)
    setResult(null)
    emit(`CLAIM SUBMITTED · ID:${citizenId.slice(0, 4)}•••••••• · SCHEME:${scheme}`, '')
    try {
      const r = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizen_id: citizenId, scheme }),
      })
      const data = await r.json()
      setResult(data)
      if (data.approved) {
        setApproved(n => n + 1)
        emit(`✅ GATE APPROVED · ${scheme} · ${toINR(data.amount)}`, 'tg')
      } else {
        setRejected(n => n + 1)
        emit(`❌ GATE ${(data.gate || '?').toUpperCase()} REJECTED · ${(data.reason || '').slice(0, 60)}`, 'tr')
      }
      poll()
    } catch {
      setResult({ approved: false, gate: 'Network', reason: 'Server unreachable. Please retry.' })
      emit('⚠ NETWORK ERROR — SERVER UNREACHABLE', 'tr')
    } finally {
      setLoading(false)
      setCitizenId('')
    }
  }

  // ── Admin ─────────────────────────────────────────────────────────────────────
  const handlePause = async () => {
    if (!confirm) {
      setConfirm(true)
      clearTimeout(confirmRef.current)
      confirmRef.current = setTimeout(() => setConfirm(false), 3000)
      return
    }
    setConfirm(false)
    try {
      await fetch('/api/admin/pause', { method: 'POST' })
      emit('🛑 ADMIN — EMERGENCY PAUSE ACTIVATED', 'tr')
      poll()
    } catch { emit('⚠ ADMIN ACTION FAILED — NETWORK ERROR', 'tr') }
  }

  const handleResume = async () => {
    try {
      await fetch('/api/admin/resume', { method: 'POST' })
      emit('▶ ADMIN — SYSTEM RESUMED', 'tg')
      poll()
    } catch { emit('⚠ ADMIN ACTION FAILED — NETWORK ERROR', 'tr') }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const status = sysState?.status ?? 'active'
  const budget = sysState?.budget ?? INI_BUDGET
  const budgetPct = budget / INI_BUDGET
  const txCount = sysState?.transactionCount ?? approved
  const integrity = sysState?.ledgerIntegrity !== false
  const isBlocked = status !== 'active'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`app ${status}`}>

      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className={`mast ${status}`}>
        <div className="mast-brand">
          <Logo />
          <div>
            <div className="mast-name">
              {status === 'frozen' ? '⚠\u00a0SYSTEM FROZEN' : 'Jan-Dhan Gateway'}
            </div>
            <div className="mast-sub">Sequential Validation Engine\u00a0//\u00a0v2.1.4</div>
          </div>
        </div>
        <div className="pills">
          <div className={`pill ${status === 'active' ? 'sys-active' : ''}`}>
            <span className={`dot ${status === 'active' ? 't' : status === 'paused' ? 'g' : 'r'}`} />
            <strong>{status.toUpperCase()}</strong>
          </div>
          <div className="pill">
            <span className="dot g" />
            <span>{toINR(budget)}</span>
          </div>
          <div className="pill">
            <span className={`dot ${integrity ? 't' : 'r'}`} />
            <strong>LEDGER {integrity ? 'INTACT' : 'TAMPERED'}</strong>
          </div>
        </div>
      </header>

      {/* Frozen notification */}
      {status === 'frozen' && (
        <div className="frz-toast">
          <div className="ft-title">🔴 Security Event — System Frozen</div>
          <div className="ft-body">All claim processing halted. Admin restart required.</div>
        </div>
      )}

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="layout">

        {/* ─── Left: Command Surface ─────────────────────────────────────── */}
        <div className="cmd">

          {/* Claim form */}
          <div className="sec">
            <div className="sec-ttl">Initiate Claim Verification</div>
            <form onSubmit={handleSubmit} autoComplete="off">

              {/* Citizen ID */}
              <div className="fg">
                <label className={`fl ${focused ? 'hashing' : ''}`}>
                  Citizen ID
                  <span className="fl-tag">SHA-256 ACTIVE</span>
                </label>
                <div className={`id-wrap ${focused ? 'on' : ''}`}>
                  <input
                    className="id-inp"
                    type="text" inputMode="numeric"
                    placeholder="000000000000"
                    maxLength={12}
                    value={citizenId}
                    disabled={loading}
                    onChange={e => setCitizenId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                </div>
              </div>

              {/* Scheme dropdown */}
              <div className="fg">
                <label className="fl">Benefit Scheme</label>
                <div className="dd" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`dd-btn ${ddOpen ? 'open' : ''}`}
                    disabled={loading}
                    onClick={() => setDdOpen(o => !o)}
                  >
                    <div className="dd-left">
                      {scheme
                        ? <><span className="s-icon">{SCHEME_ICON[scheme] || '📋'}</span><span>{scheme}</span></>
                        : <span className="dd-ph">— Select scheme —</span>}
                    </div>
                    <span className="dd-arr">▾</span>
                  </button>
                  {ddOpen && (
                    <div className="dd-menu">
                      {schemes.map(s => (
                        <div
                          key={s}
                          className={`dd-opt ${scheme === s ? 'sel' : ''}`}
                          onClick={() => { setScheme(s); setDdOpen(false) }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span className="s-icon">{SCHEME_ICON[s] || '📋'}</span>
                            <span>{s}</span>
                          </div>
                          <span className="o-amt">Fixed rate</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className={`sub-btn ${isBlocked ? 'blocked' : ''}`}
                disabled={loading || !citizenId || !scheme}
              >
                <div className="bi">
                  {loading
                    ? <><div className="spin" /><span>Processing…</span></>
                    : isBlocked
                      ? '⚠ System Unavailable'
                      : 'Verify Identity\u00a0&\u00a0Process Claim'}
                </div>
              </button>
            </form>

            {/* Result panel */}
            {result && (
              <div className={`res ${result.approved ? 'ok' : 'err'}`}>
                <div className="res-hd">
                  <span className="res-ico">{result.approved ? '✅' : '❌'}</span>
                  <span className="res-vd">{result.approved ? 'Approved' : 'Rejected'}</span>
                </div>
                <div className="res-msg">{result.reason}</div>
                {result.approved && (
                  <div className="res-rows">
                    <div className="rr"><span>Scheme</span><strong>{result.scheme}</strong></div>
                    <div className="rr"><span>Amount</span><strong>{toINR(result.amount)}</strong></div>
                    <div className="rr">
                      <span>Timestamp</span>
                      <strong>{result.timestamp
                        ? new Date(result.timestamp).toLocaleTimeString('en-IN', { hour12: false })
                        : ts8()}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gate Visualization */}
          <div className="sec">
            <div className="sec-ttl">Validation Gates</div>
            <GateViz result={result} />
          </div>

          {/* Admin Controls */}
          <div className="sec">
            <div className="sec-ttl danger">Admin Control — Authorized Access Only</div>
            <div className={`sys-wide ${status}`}>
              <div className="sw-l">
                <span className={`dot ${status === 'active' ? 't' : status === 'paused' ? 'g' : 'r'}`} />
                <span className="sw-lbl">
                  {status === 'active' ? 'System Operational'
                    : status === 'paused' ? 'System Paused'
                      : 'System Frozen'}
                </span>
              </div>
              <span className="sw-up">{uptime}</span>
            </div>
            <div className="adm-row">
              <button
                className={`btn-lock ${confirm ? 'confirm' : ''}`}
                onClick={handlePause}
                disabled={status !== 'active'}
              >
                {confirm && <div className="ctip">Click again to confirm lockdown</div>}
                🛑&nbsp;Emergency Lockdown
              </button>
              <button className="btn-res" onClick={handleResume} disabled={status !== 'paused'}>
                ▶&nbsp;Resume
              </button>
            </div>
          </div>
        </div>

        {/* ─── Right: Intelligence Panel ─────────────────────────────────── */}
        <div className="intel">

          {/* Metric cards */}
          <div className="met">
            <div className="a-lbl">Live Operations Dashboard</div>
            <div className="mcg">
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
                <div className="mc-val">{rejected}</div>
                <div className="mc-bot">
                  <span className="mc-sub">this session</span>
                  <Spark color="#E63946" seed={3} />
                </div>
              </div>

              <div className="mc amber">
                <div className="mc-top">
                  <span className="mc-lbl">Ledger Integrity</span>
                </div>
                <div className="mc-val">
                  {integrity ? '✅ VALID' : '⚠ TAMPERED'}
                </div>
                <div className="mc-bot">
                  <span className="mc-sub">{ledger.length} entries chained</span>
                </div>
              </div>
            </div>
          </div>

          {/* Integrity strip */}
          <div className="istrip">
            <span className="is-icon">{integrity ? '🔒' : '⚠️'}</span>
            <span className={`is-label ${integrity ? '' : 'bad'}`}>
              Chain {integrity ? 'Verified' : 'FAILED'}
            </span>
            <span className={`is-hash ${ihashSc ? 'scr' : ''}`}>{ihash}</span>
          </div>

          {/* Immutable Ledger */}
          <div className="ledger">
            <div className="ledger-hd">
              <span className="ledger-ttl">Immutable Transaction Ledger</span>
              <span className="ledger-cnt">{ledger.length} records</span>
            </div>
            <div className="ledger-body">
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
                        <tr
                          key={e.timestamp || i}
                          className={`lrow ${e.timestamp === newTs ? 'new' : ''}`}
                        >
                          <td className="td-t">{ledger.length - i}</td>
                          <td className="td-t">
                            {e.timestamp
                              ? new Date(e.timestamp).toLocaleTimeString('en-IN', { hour12: false })
                              : '—'}
                          </td>
                          <HashCell full={e.citizenHash} short={e.citizenHash} />
                          <td className="td-s">{e.scheme}</td>
                          <td className="td-a">{toINR(e.amount)}</td>
                          <td className="td-c"><span className="ch-ic">⛓</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Event Ticker ─────────────────────────────────────────────────── */}
      <EventTicker events={events} />
    </div>
  )
}
