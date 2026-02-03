import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import './Codespaces.css'

function Codespaces({ user, logout }) {
  const navigate = useNavigate()
  const { name } = useParams()
  const [codespaces, setCodespaces] = useState([])
  const [activeName, setActiveName] = useState(name || '')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    loadCodespaces()
  }, [])

  useEffect(() => {
    if (name) {
      loadCodespace(name)
    }
  }, [name])

  const loadCodespaces = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/codespaces', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      setCodespaces(data.codespaces || [])
    } catch (err) {
      console.error('Failed to load codespaces:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCodespace = async (codespaceName) => {
    if (!codespaceName) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/codespaces/${encodeURIComponent(codespaceName)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.codespace) {
        setActiveName(data.codespace.name)
        setContent(data.codespace.content || '')
      }
    } catch (err) {
      console.error('Failed to load codespace:', err)
    }
  }

  const createCodespace = async (event) => {
    event.preventDefault()
    if (!newName) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/codespaces', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName })
      })
      const data = await response.json()
      if (response.ok) {
        setNewName('')
        await loadCodespaces()
        navigate(`/codespaces/${encodeURIComponent(data.name)}`)
      } else {
        alert(data.error || 'Failed to create codespace')
      }
    } catch (err) {
      console.error('Failed to create codespace:', err)
      alert('Failed to create codespace')
    }
  }

  const saveCodespace = async () => {
    if (!activeName) return
    setSaving(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/codespaces/${encodeURIComponent(activeName)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save')
      }
      await loadCodespaces()
    } catch (err) {
      console.error('Failed to save codespace:', err)
      alert('Failed to save codespace')
    } finally {
      setSaving(false)
    }
  }

  const deleteCodespace = async (codespaceName) => {
    if (!confirm(`Delete codespace "${codespaceName}"?`)) return
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/codespaces/${encodeURIComponent(codespaceName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error('Failed to delete')
      }
      if (codespaceName === activeName) {
        setActiveName('')
        setContent('')
        navigate('/codespaces')
      }
      await loadCodespaces()
    } catch (err) {
      console.error('Failed to delete codespace:', err)
      alert('Failed to delete codespace')
    }
  }

  if (loading) {
    return (
      <div>
        <Header user={user} logout={logout} />
        <div className="container">Loading codespaces...</div>
      </div>
    )
  }

  return (
    <div className="codespaces-page">
      <Header user={user} logout={logout} />
      <div className="codespaces-layout">
        <aside className="codespaces-sidebar">
          <h2>Codespaces</h2>
          <form onSubmit={createCodespace} className="codespaces-create">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New codespace name"
              required
            />
            <button type="submit" className="btn-primary">Create</button>
          </form>
          <div className="codespaces-list">
            {codespaces.length === 0 && <p>No codespaces yet.</p>}
            {codespaces.map((space) => (
              <div key={space.id} className={`codespace-item ${space.name === activeName ? 'active' : ''}`}>
                <button onClick={() => navigate(`/codespaces/${encodeURIComponent(space.name)}`)}>
                  {space.name}
                </button>
                <span className="codespace-updated">
                  {space.updated_at ? new Date(space.updated_at).toLocaleDateString() : '—'}
                </span>
                <button className="link-danger" onClick={() => deleteCodespace(space.name)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="codespaces-editor">
          {activeName ? (
            <>
              <div className="codespace-header">
                <div>
                  <h3>{activeName}</h3>
                  <p>Personal codespace stored for your account.</p>
                </div>
                <button className="btn-primary" onClick={saveCodespace} disabled={saving}>
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
              <textarea
                className="codespace-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start coding..."
              />
            </>
          ) : (
            <div className="codespace-empty">
              <h3>Select a codespace to start coding</h3>
              <p>Create a new codespace to persist your work.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default Codespaces
