// GateViz.jsx — Three-gate circuit visualization with animated path trace
import { useEffect, useState } from 'react'

const GATES = [
    { icon: '🛡', name: 'Eligibility' },
    { icon: '🏦', name: 'Budget' },
    { icon: '🕐', name: 'Frequency' },
]

// Map API gate name → which gate index fails (-1 = all pass)
const GATE_FAIL_IDX = {
    System: 0, Replay: 0, Eligibility: 0,
    Budget: 1, Frequency: 2, Approved: -1,
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function GateViz({ result, onAnimationDone }) {
    const [phase, setPhase] = useState('idle')    // idle | computing | done
    const [states, setStates] = useState([null, null, null]) // null | pass | fail
    const [statuses, setStatus] = useState(['—', '—', '—'])

    useEffect(() => {
        if (!result) { setPhase('idle'); setStates([null, null, null]); setStatus(['—', '—', '—']); return }
        animate(result)
    }, [result])

    async function animate(res) {
        setPhase('computing')
        setStates([null, null, null])
        setStatus(['computing…', 'computing…', 'computing…'])
        await sleep(1200)

        const failIdx = GATE_FAIL_IDX[res.gate] ?? -1
        const newStates = [null, null, null]
        const newStatus = ['—', '—', '—']

        for (let i = 0; i < 3; i++) {
            if (failIdx === -1) {
                newStates[i] = 'pass'
                newStatus[i] = 'PASS'
            } else if (i < failIdx) {
                newStates[i] = 'pass'
                newStatus[i] = 'PASS'
            } else if (i === failIdx) {
                newStates[i] = 'fail'
                newStatus[i] = 'FAIL'
            } else {
                newStates[i] = null
                newStatus[i] = 'SKIP'
            }
            setStates([...newStates])
            setStatus([...newStatus])
            if (i < 2) await sleep(420)
        }
        setPhase('done')
        onAnimationDone?.()
    }

    return (
        <div className="gate-viz">
            <div className="gates-row">
                {GATES.map((g, i) => {
                    const st = states[i]
                    const isComputing = phase === 'computing' && states[i] === null
                    return (
                        <div key={g.name} className={`gate-node ${st || ''}`}>
                            <div className={`gate-circle ${isComputing ? 'computing' : (st || '')}`}>
                                {g.icon}
                            </div>
                            <span className="gate-name">{g.name}</span>
                            <span className="gate-st">{statuses[i]}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
