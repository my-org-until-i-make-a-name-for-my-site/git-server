import { useState, useEffect } from 'react'
import Header from '../components/Header'
import './Admin.css'

function Admin({ user, logout }) {
    const [activeTab, setActiveTab] = useState('overview')
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [repos, setRepos] = useState([])
    const [orgs, setOrgs] = useState([])
    const [loading, setLoading] = useState(true)
    const [sqlQuery, setSqlQuery] = useState('')
    const [sqlResult, setSqlResult] = useState(null)
    const [clusters, setClusters] = useState([])
    const [clusterSummary, setClusterSummary] = useState(null)

    useEffect(() => {
        loadData()
    }, [activeTab])

    const loadData = async () => {
        const token = localStorage.getItem('token')

        try {
            if (activeTab === 'overview' || activeTab === 'users') {
                const statsRes = await fetch('/api/admin/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const statsData = await statsRes.json()
                setStats(statsData)
            }

            if (activeTab === 'users') {
                const usersRes = await fetch('/api/admin/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const usersData = await usersRes.json()
                setUsers(usersData.users || [])
            }

            if (activeTab === 'repos') {
                const reposRes = await fetch('/api/admin/repositories', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const reposData = await reposRes.json()
                setRepos(reposData.repositories || [])
            }

            if (activeTab === 'orgs') {
                const orgsRes = await fetch('/api/admin/organizations', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const orgsData = await orgsRes.json()
                setOrgs(orgsData.organizations || [])
            }

            if (activeTab === 'clusters') {
                const clustersRes = await fetch('/api/clusters/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const clustersData = await clustersRes.json()
                setClusters(clustersData.clusters || [])
                setClusterSummary(clustersData.summary || null)
            }

            setLoading(false)
        } catch (err) {
            console.error('Failed to load admin data:', err)
            setLoading(false)
        }
    }

    const handleClusterAction = async (clusterId, action) => {
        const token = localStorage.getItem('token')
        try {
            await fetch(`/api/clusters/${clusterId}/${action}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            loadData()
        } catch (err) {
            console.error(`Failed to ${action} cluster:`, err)
        }
    }

    const promoteToAdmin = async (username) => {
        const token = localStorage.getItem('token')
        try {
            await fetch(`/api/admin/users/${username}/promote-admin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            loadData()
        } catch (err) {
            console.error('Failed to promote user:', err)
        }
    }

    const promoteToModerator = async (username) => {
        const token = localStorage.getItem('token')
        try {
            await fetch(`/api/admin/users/${username}/promote-moderator`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            loadData()
        } catch (err) {
            console.error('Failed to promote user:', err)
        }
    }

    const demoteUser = async (username) => {
        const token = localStorage.getItem('token')
        try {
            await fetch(`/api/admin/users/${username}/demote`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            loadData()
        } catch (err) {
            console.error('Failed to demote user:', err)
        }
    }

    return (
        <div className="admin-page">
            <Header user={user} logout={logout} />

            <div className="admin-content">
                <div className="admin-header">
                    <h1>🛠️ Admin Panel</h1>
                    <p>Manage users, repositories, and platform settings</p>
                </div>

                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        Users
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'repos' ? 'active' : ''}`}
                        onClick={() => setActiveTab('repos')}
                    >
                        Repositories
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'orgs' ? 'active' : ''}`}
                        onClick={() => setActiveTab('orgs')}
                    >
                        Organizations
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'sql' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sql')}
                    >
                        SQL Console
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'clusters' ? 'active' : ''}`}
                        onClick={() => setActiveTab('clusters')}
                    >
                        Clusters
                    </button>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        Loading...
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && stats && (
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h3>Total Users</h3>
                                    <div className="stat-value">{stats.stats?.userCount || stats.userCount || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Total Repositories</h3>
                                    <div className="stat-value">{stats.stats?.repoCount || stats.repoCount || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Total Organizations</h3>
                                    <div className="stat-value">{stats.stats?.orgCount || stats.orgCount || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Admins</h3>
                                    <div className="stat-value">{stats.stats?.adminCount || stats.adminCount || 0}</div>
                                </div>
                                <div className="stat-card">
                                    <h3>Moderators</h3>
                                    <div className="stat-value">{stats.stats?.moderatorCount || stats.moderatorCount || 0}</div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <div className="data-table">
                                <div className="table-header">
                                    <h2>User Management</h2>
                                    <input
                                        type="text"
                                        className="search-box"
                                        placeholder="Search users..."
                                    />
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Username</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Created</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id}>
                                                <td>
                                                    <div className="user-info">
                                                        {u.username}
                                                        {u.role === 'admin' && <span className="user-badge admin">Admin</span>}
                                                        {u.role === 'moderator' && <span className="user-badge moderator">Mod</span>}
                                                    </div>
                                                </td>
                                                <td>{u.email}</td>
                                                <td>{u.role || 'user'}</td>
                                                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                                <td>
                                                    <div className="action-buttons">
                                                        {u.role !== 'admin' && (
                                                            <button
                                                                className="action-btn primary"
                                                                onClick={() => promoteToAdmin(u.username)}
                                                            >
                                                                Make Admin
                                                            </button>
                                                        )}
                                                        {u.role !== 'moderator' && u.role !== 'admin' && (
                                                            <button
                                                                className="action-btn"
                                                                onClick={() => promoteToModerator(u.username)}
                                                            >
                                                                Make Moderator
                                                            </button>
                                                        )}
                                                        {(u.role === 'admin' || u.role === 'moderator') && u.username !== user.username && (
                                                            <button
                                                                className="action-btn danger"
                                                                onClick={() => demoteUser(u.username)}
                                                            >
                                                                Demote
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'repos' && (
                            <div className="data-table">
                                <div className="table-header">
                                    <h2>Repository Management</h2>
                                    <input
                                        type="text"
                                        className="search-box"
                                        placeholder="Search repositories..."
                                    />
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Repository</th>
                                            <th>Owner</th>
                                            <th>Type</th>
                                            <th>Created</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {repos.map(r => (
                                            <tr key={r.id}>
                                                <td>
                                                    <a className="repo-link" href={`/${r.owner_name}/${r.name}`}>
                                                        {r.name}
                                                    </a>
                                                </td>
                                                <td>{r.owner_name}</td>
                                                <td>{r.owner_type.replace("u", "U").replace("o", "O")}</td>
                                                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'orgs' && (
                            <div className="data-table">
                                <div className="table-header">
                                    <h2>Organization Management</h2>
                                    <input
                                        type="text"
                                        className="search-box"
                                        placeholder="Search organizations..."
                                    />
                                </div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Organization</th>
                                            <th>Display Name</th>
                                            <th>Created</th>
                                            <th>Repositories</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orgs.map(o => (
                                            <tr key={o.id}>
                                                <td>{o.name}</td>
                                                <td>{o.display_name || '-'}</td>
                                                <td>{new Date(o.created_at).toLocaleDateString()}</td>
                                                <td>{o.repo_count || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'sql' && (
                            <div className="sql-console">
                                <div className="sql-header">
                                    <h2>SQL Console</h2>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>
                                        Direct database access for admins. Use with caution.
                                    </p>
                                </div>
                                <textarea
                                    value={sqlQuery}
                                    onChange={(e) => setSqlQuery(e.target.value)}
                                    placeholder="Enter SQL query..."
                                    rows="8"
                                    style={{
                                        width: '100%',
                                        padding: '1rem',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9em',
                                        background: 'var(--input-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        marginBottom: '1rem'
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        const token = localStorage.getItem('token')
                                        try {
                                            const res = await fetch('/api/admin/sql', {
                                                method: 'POST',
                                                headers: {
                                                    'Authorization': `Bearer ${token}`,
                                                    'Content-Type': 'application/json'
                                                },
                                                body: JSON.stringify({ query: sqlQuery })
                                            })
                                            const data = await res.json()
                                            setSqlResult(data)
                                        } catch (err) {
                                            setSqlResult({ error: err.message })
                                        }
                                    }}
                                    className="action-btn primary"
                                    style={{ marginBottom: '1rem' }}
                                >
                                    Execute Query
                                </button>
                                {sqlResult && (
                                    <div className="sql-result" style={{
                                        background: 'var(--card-bg)',
                                        padding: '1rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        {sqlResult.error ? (
                                            <div style={{ color: '#ff6b6b' }}>
                                                Error: {sqlResult.error}
                                            </div>
                                        ) : (
                                            <>
                                                {sqlResult.rows && (
                                                    <>
                                                        <div style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                                            {sqlResult.count} row(s) returned
                                                        </div>
                                                        <pre style={{
                                                            overflow: 'auto',
                                                            maxHeight: '400px',
                                                            background: 'var(--input-bg)',
                                                            padding: '1rem',
                                                            borderRadius: '4px'
                                                        }}>
                                                            {JSON.stringify(sqlResult.rows, null, 2)}
                                                        </pre>
                                                    </>
                                                )}
                                                {sqlResult.changes !== undefined && (
                                                    <div>
                                                        {sqlResult.message}<br />
                                                        Rows affected: {sqlResult.changes}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'clusters' && (
                            <div className="cluster-management">
                                <h2>Cluster Management</h2>
                                <p style={{ color: 'var(--text-secondary)' }}>
                                    Connected clusters on the local network
                                </p>
                                {clusterSummary && (
                                    <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                                        <div className="stat-card">
                                            <h3>Total Clusters</h3>
                                            <div className="stat-value">{clusterSummary.total || 0}</div>
                                        </div>
                                        <div className="stat-card">
                                            <h3>Online</h3>
                                            <div className="stat-value">{clusterSummary.online || 0}</div>
                                        </div>
                                        <div className="stat-card">
                                            <h3>Running Tasks</h3>
                                            <div className="stat-value">{clusterSummary.runningTasks || 0}</div>
                                        </div>
                                        <div className="stat-card">
                                            <h3>Available Slots</h3>
                                            <div className="stat-value">{clusterSummary.availableSlots || 0}</div>
                                        </div>
                                    </div>
                                )}
                                <div id="clusterList">
                                    {clusters.length === 0 ? (
                                        <p>No clusters discovered</p>
                                    ) : (
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>Cluster</th>
                                                    <th>Address</th>
                                                    <th>CPU</th>
                                                    <th>Memory</th>
                                                    <th>Status</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {clusters.map(cluster => (
                                                    <tr key={cluster.id}>
                                                        <td>{cluster.hostname || cluster.id}</td>
                                                        <td>{cluster.address}:{cluster.port}</td>
                                                        <td>{cluster.cpus || 0}</td>
                                                        <td>{cluster.totalMemory ? Math.round(cluster.totalMemory / (1024 * 1024 * 1024)) + ' GB' : 'N/A'}</td>
                                                        <td>{cluster.stats ? 'Online' : 'Offline'}</td>
                                                        <td>
                                                            <div className="action-buttons">
                                                                <button
                                                                    className="action-btn"
                                                                    onClick={() => handleClusterAction(cluster.id, 'disconnect')}
                                                                >
                                                                    Disconnect
                                                                </button>
                                                                <button
                                                                    className="action-btn primary"
                                                                    onClick={() => handleClusterAction(cluster.id, 'reconnect')}
                                                                >
                                                                    Reconnect
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default Admin
