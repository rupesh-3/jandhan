/**
 * state.js — System State Singleton
 * Manages system status (active/paused/frozen), budget, and transaction count.
 * Node.js is single-threaded so no locking needed.
 */

const INITIAL_BUDGET = 1000000; // ₹10,00,000

const _state = {
  status: 'active',        // 'active' | 'paused' | 'frozen'
  budget: INITIAL_BUDGET,
  transactionCount: 0,
  initialBudget: INITIAL_BUDGET,
};

function getState() {
  return { ..._state };
}

/** Pause the system (admin action). Only works if currently active. */
function pause() {
  if (_state.status === 'active') {
    _state.status = 'paused';
    console.log('[STATE] System paused by admin.');
  }
}

/** Resume the system. Only works if currently paused (not frozen). */
function resume() {
  if (_state.status === 'paused') {
    _state.status = 'active';
    console.log('[STATE] System resumed by admin.');
  }
}

/** Freeze the system (security event). Cannot be undone without restart. */
function freeze() {
  _state.status = 'frozen';
  console.error('[STATE] ⚠ SYSTEM FROZEN — Security or budget event detected.');
}

/**
 * Deduct amount from budget. Auto-freezes if budget hits zero.
 * @param {number} amount
 */
function deduct(amount) {
  _state.budget -= amount;
  if (_state.budget <= 0) {
    _state.budget = 0;
    freeze();
  }
}

/** Increment total approved transaction count. */
function incrTx() {
  _state.transactionCount += 1;
}

module.exports = { getState, pause, resume, freeze, deduct, incrTx };
