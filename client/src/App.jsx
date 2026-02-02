import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Repository from './pages/Repository'
import Profile from './pages/Profile'
import Organization from './pages/Organization'
import Admin from './pages/Admin'
import FileBrowser from './pages/FileBrowser'
import Search from './pages/Search'
import Explore from './pages/Explore'
import Settings from './pages/Settings'
import IssueDetail from './pages/IssueDetail'
import PullRequestDetail from './pages/PullRequestDetail'
import WorkflowRunDetail from './pages/WorkflowRunDetail'

function App() {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const token = localStorage.getItem('token')
        if (token) {
            // Verify token and get user
            fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.user) {
                        setUser(data.user)
                    }
                    setLoading(false)
                })
                .catch(() => {
                    localStorage.removeItem('token')
                    setLoading(false)
                })
        } else {
            setLoading(false)
        }
    }, [])

    const logout = () => {
        localStorage.removeItem('token')
        setUser(null)
    }

    if (loading) {
        return (
            <ThemeProvider>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh'
                }}>
                    <div>Loading Codara...</div>
                </div>
            </ThemeProvider>
        )
    }

    return (
        <ThemeProvider>
            <Router>
                <Routes>
                    <Route
                        path="/login"
                        element={user ? <Navigate to="/" /> : <Login setUser={setUser} />}
                    />
                    <Route
                        path="/signup"
                        element={user ? <Navigate to="/" /> : <Signup setUser={setUser} />}
                    />
                    <Route
                        path="/"
                        element={user ? <Dashboard user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/search"
                        element={user ? <Search user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/explore"
                        element={user ? <Explore user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/settings"
                        element={user ? <Settings user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/profile/:username"
                        element={user ? <Profile user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/org/:orgname"
                        element={user ? <Organization user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo"
                        element={user ? <Repository user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo.git"
                        element={user ? <Repository user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/files"
                        element={user ? <FileBrowser user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/files/*"
                        element={user ? <FileBrowser user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/issues"
                        element={user ? <Repository user={user} logout={logout} tab="issues" /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/issues/:number"
                        element={user ? <IssueDetail user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/pulls"
                        element={user ? <Repository user={user} logout={logout} tab="pulls" /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/pulls/:number"
                        element={user ? <PullRequestDetail user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/commits"
                        element={user ? <Repository user={user} logout={logout} tab="commits" /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/actions"
                        element={user ? <Repository user={user} logout={logout} tab="actions" /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/:owner/:repo/actions/runs/:runId"
                        element={user ? <WorkflowRunDetail user={user} logout={logout} /> : <Navigate to="/login" />}
                    />
                    <Route
                        path="/admin"
                        element={user && user.is_admin ? <Admin user={user} logout={logout} /> : <Navigate to="/" />}
                    />
                </Routes>
            </Router>
        </ThemeProvider>
    )
}

export default App
