import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import Notifications from './Notifications'
import AIAssistant from './AIAssistant'
import { SunIcon, MoonIcon, SettingsIcon } from './Icons'
import './Header.css'

function Header({ user, logout }) {
    const { theme, toggleTheme } = useTheme()

    return (
        <header className="header">
            <div className="header-content">
                <Link to="/" className="header-logo">
                    Codara
                </Link>

                <nav className="header-nav">
                    <Link to="/" className="nav-link">Repositories</Link>
                    <Link to="/explore" className="nav-link">Explore</Link>
                    <Link to="/search" className="nav-link">Search</Link>
                    <Link to="/codespaces" className="nav-link">Codespaces</Link>
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
                        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                    </button>
                    <AIAssistant user={user} />


                    <Notifications user={user} />
                    <Link to="/settings" className="settings-link" title="Settings">
                        <SettingsIcon />
                    </Link>


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
