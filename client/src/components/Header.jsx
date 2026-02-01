import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import Notifications from './Notifications'
import './Header.css'

function Header({ user, logout }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="header-logo">
          🔧 Codara
        </Link>
        
        <nav className="header-nav">
          <Link to="/" className="nav-link">Repositories</Link>
          <Link to="/explore" className="nav-link">Explore</Link>
          <Link to="/search" className="nav-link">Search</Link>
          {user.is_admin && (
            <Link to="/admin" className="nav-link">Admin</Link>
          )}
        </nav>

        <div className="header-actions">
          <button 
            onClick={toggleTheme} 
            className="theme-toggle"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          <Notifications user={user} />
          
          <Link to={`/profile/${user.username}`} className="user-link">
            {user.username}
            {user.role === 'admin' && <span className="badge">Admin</span>}
            {user.role === 'moderator' && <span className="badge mod">Moderator</span>}
          </Link>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </div>
    </header>
  )
}

export default Header
