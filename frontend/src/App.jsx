import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import ClaimPage from './pages/ClaimPage'
import AdminPage from './pages/AdminPage'
import './index.css'

function Navbar() {
  const location = useLocation()
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="navbar-logo">🏛</span>
        <span className="navbar-title">Jan-Dhan Gateway</span>
        <span className="navbar-subtitle">Government of India — Welfare Distribution System</span>
      </div>
      <div className="navbar-links">
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
          Citizen Portal
        </Link>
        <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
          Admin Dashboard
        </Link>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-wrapper">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ClaimPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <p>Jan-Dhan Gateway · SHA-256 Secured · Immutable Ledger · © Government of India</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
