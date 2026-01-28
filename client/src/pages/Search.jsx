import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import './Search.css'

function Search({ user, logout }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [results, setResults] = useState({ repos: [], orgs: [], users: [] })
  const [loading, setLoading] = useState(false)

  const performSearch = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    const token = localStorage.getItem('token')

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${filter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setResults(data)
      setLoading(false)
    } catch (err) {
      console.error('Search failed:', err)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (query.length > 2) {
      const timer = setTimeout(() => performSearch(), 300)
      return () => clearTimeout(timer)
    }
  }, [query, filter])

  return (
    <div className="search-page">
      <Header user={user} logout={logout} />
      
      <div className="search-container">
        <div className="search-header">
          <h1>🔍 Search Codara</h1>
          <p>Find repositories, organizations, and users</p>
        </div>

        <div className="search-box-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="filter-tabs">
          <button 
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`filter-tab ${filter === 'repos' ? 'active' : ''}`}
            onClick={() => setFilter('repos')}
          >
            Repositories
          </button>
          <button 
            className={`filter-tab ${filter === 'orgs' ? 'active' : ''}`}
            onClick={() => setFilter('orgs')}
          >
            Organizations
          </button>
          <button 
            className={`filter-tab ${filter === 'users' ? 'active' : ''}`}
            onClick={() => setFilter('users')}
          >
            Users
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Searching...</div>
        ) : (
          <div className="results-container">
            {(filter === 'all' || filter === 'repos') && results.repos?.length > 0 && (
              <div className="results-section">
                <h2>Repositories</h2>
                <div className="results-list">
                  {results.repos.map(repo => (
                    <Link to={`/${repo.owner}/${repo.name}`} key={repo.id} className="result-item">
                      <div className="result-icon">📦</div>
                      <div className="result-content">
                        <h3>{repo.owner}/{repo.name}</h3>
                        {repo.description && <p>{repo.description}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(filter === 'all' || filter === 'orgs') && results.orgs?.length > 0 && (
              <div className="results-section">
                <h2>Organizations</h2>
                <div className="results-list">
                  {results.orgs.map(org => (
                    <Link to={`/org/${org.name}`} key={org.id} className="result-item">
                      <div className="result-icon">🏢</div>
                      <div className="result-content">
                        <h3>{org.name}</h3>
                        {org.display_name && <p>{org.display_name}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(filter === 'all' || filter === 'users') && results.users?.length > 0 && (
              <div className="results-section">
                <h2>Users</h2>
                <div className="results-list">
                  {results.users.map(u => (
                    <Link to={`/profile/${u.username}`} key={u.id} className="result-item">
                      <div className="result-icon">👤</div>
                      <div className="result-content">
                        <h3>{u.username}</h3>
                        {u.email && <p>{u.email}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {query && !loading && 
             results.repos?.length === 0 && 
             results.orgs?.length === 0 && 
             results.users?.length === 0 && (
              <div className="empty-state">
                <h3>No results found</h3>
                <p>Try different keywords</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Search
