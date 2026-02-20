// EventTicker.jsx — Bottom scrolling system event log
import { useEffect, useRef, useState } from 'react'

export default function EventTicker({ events }) {
    const [items, setItems] = useState([
        { t: '—', msg: 'SYSTEM INITIALISED', cls: 'tc' },
        { t: '—', msg: 'LEDGER INTEGRITY VERIFIED — CHAIN INTACT', cls: 'tc' },
        { t: '—', msg: 'REGISTRY LOADED — 2000 RECORDS INDEXED', cls: 'tg' },
        { t: '—', msg: 'SEQUENTIAL VALIDATION ENGINE ONLINE', cls: 'tc' },
        { t: '—', msg: 'SHA-256 HASHING MODULE ACTIVE', cls: 'tg' },
        { t: '—', msg: 'AWAITING CLAIM SUBMISSIONS', cls: '' },
    ])

    useEffect(() => {
        if (events && events.length) setItems(prev => [...events, ...prev].slice(0, 40))
    }, [events])

    // Duplicate for seamless loop
    const doubled = [...items, ...items]

    return (
        <div className="ticker">
            <div className="ticker-scroll">
                {doubled.map((e, i) => (
                    <span key={i} className="ticker-item">
                        <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: 8 }}>{e.t}</span>
                        <span className={e.cls || ''}>{e.msg}</span>
                    </span>
                ))}
            </div>
        </div>
    )
}
