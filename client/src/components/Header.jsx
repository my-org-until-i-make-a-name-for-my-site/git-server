import { Link } from 'react-router-dom'
import './Header.css'

function Header({ user, logout }) {
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="header-logo">
          🔧 Codara
        </Link>
        
        <nav className="header-nav">
          <Link to="/" className="nav-link">Repositories</Link>
          {user.is_admin && (
            <Link to="/admin" className="nav-link">Admin</Link>
          )}
        </nav>

        <div className="header-user">
          <Link to={`/profile/${user.username}`} className="user-link">
            {user.username}
            {user.role === 'admin' && <span className="badge">Admin</span>}
            {user.role === 'moderator' && <span className="badge mod">Mod</span>}
          </Link>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </div>
    </header>
  )
}

export default Header
