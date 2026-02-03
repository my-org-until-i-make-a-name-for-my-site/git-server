import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import './Codespaces.css'

const DEFAULT_FILES = [
  { path: 'index.html', type: 'file', content: '<!DOCTYPE html>\n<html>\n  <head>\n    <title>Flame Codespace</title>\n  </head>\n  <body>\n    <h1>Hello from Codara Codespaces</h1>\n  </body>\n</html>\n' },
  { path: 'style.css', type: 'file', content: 'body { font-family: sans-serif; }\n' },
  { path: 'app.js', type: 'file', content: 'console.log(\"Codespace ready\");\n' }
]

const languageMap = {
  html: 'html',
  css: 'css',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  txt: 'plaintext'
}

function getLanguageFor(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  return languageMap[ext] || 'plaintext'
}

function Codespaces({ user, logout }) {
  const navigate = useNavigate()
  const { name } = useParams()
  const [codespaces, setCodespaces] = useState([])
  const [activeName, setActiveName] = useState(name || '')
  const [editorFiles, setEditorFiles] = useState(DEFAULT_FILES)
  const [activeFile, setActiveFile] = useState(DEFAULT_FILES[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [monacoReady, setMonacoReady] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const editorRef = useRef(null)
  const monacoRef = useRef(null)

  const token = localStorage.getItem('token')

  useEffect(() => {
    loadCodespaces()
  }, [])

  useEffect(() => {
    if (name) {
      loadCodespace(name)
    }
  }, [name])

  useEffect(() => {
    if (!editorRef.current) return
    if (!monacoReady) {
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/monaco-editor@0.45.0/min/vs/loader.js'
      script.onload = () => setMonacoReady(true)
      document.body.appendChild(script)
      return
    }

    window.require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' } })
    window.require(['vs/editor/editor.main'], () => {
      if (monacoRef.current) {
        monacoRef.current.dispose()
      }
      const model = window.monaco.editor.createModel(activeFile.content, getLanguageFor(activeFile.path))
      monacoRef.current = window.monaco.editor.create(editorRef.current, {
        model,
        theme: document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
        automaticLayout: true
      })
      model.onDidChangeContent(() => {
        const updated = model.getValue()
        setEditorFiles((prev) =>
          prev.map((file) => (file.path === activeFile.path ? { ...file, content: updated } : file))
        )
      })
    })
    return () => {
      if (monacoRef.current) {
        monacoRef.current.dispose()
      }
    }
  }, [activeFile, monacoReady])

  const previewHtml = useMemo(() => {
    const html = editorFiles.find((file) => file.path.endsWith('.html'))?.content || ''
    const css = editorFiles.find((file) => file.path.endsWith('.css'))?.content || ''
    const js = editorFiles.find((file) => file.path.endsWith('.js'))?.content || ''
    return `${html}\n<style>${css}</style>\n<script>${js}<\/script>`
  }, [editorFiles])

  const loadCodespaces = async () => {
    try {
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
      const response = await fetch(`/api/codespaces/${encodeURIComponent(codespaceName)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (data.codespace) {
        setActiveName(data.codespace.name)
        const parsed = data.codespace.content ? JSON.parse(data.codespace.content) : null
        const files = parsed?.files?.length ? parsed.files : DEFAULT_FILES
        setEditorFiles(files)
        setActiveFile(files[0])
        setSaveMessage(parsed?.saveMessage || '')
      }
    } catch (err) {
      console.error('Failed to load codespace:', err)
    }
  }

  const createCodespace = async (event) => {
    event.preventDefault()
    if (!newName) return
    try {
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
      const payload = JSON.stringify({
        files: editorFiles,
        saveMessage,
        updatedAt: new Date().toISOString()
      })
      const response = await fetch(`/api/codespaces/${encodeURIComponent(activeName)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: payload })
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
      const response = await fetch(`/api/codespaces/${encodeURIComponent(codespaceName)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        throw new Error('Failed to delete')
      }
      if (codespaceName === activeName) {
        setActiveName('')
        setEditorFiles(DEFAULT_FILES)
        setActiveFile(DEFAULT_FILES[0])
        setSaveMessage('')
        navigate('/codespaces')
      }
      await loadCodespaces()
    } catch (err) {
      console.error('Failed to delete codespace:', err)
      alert('Failed to delete codespace')
    }
  }

  const createFile = () => {
    const name = prompt('New file name')
    if (!name) return
    if (editorFiles.find((file) => file.path === name)) {
      alert('File already exists')
      return
    }
    const newFile = { path: name, type: 'file', content: '' }
    setEditorFiles((prev) => [...prev, newFile])
    setActiveFile(newFile)
  }

  const deleteFile = (path) => {
    if (!confirm(`Delete ${path}?`)) return
    setEditorFiles((prev) => prev.filter((file) => file.path !== path))
    if (activeFile.path === path) {
      const next = editorFiles.find((file) => file.path !== path)
      setActiveFile(next || DEFAULT_FILES[0])
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
    <div className="codespaces-page flame">
      <Header user={user} logout={logout} />
      <div className="codespace-topbar">
        <div className="codespace-brand">Flame Codespaces</div>
        <div className="codespace-actions">
          <span className="codespace-meta">Infinite usage for your account</span>
          <button className="btn-primary" onClick={saveCodespace} disabled={saving || !activeName}>
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      <div className="codespaces-layout flame-layout">
        <aside className="codespaces-sidebar flame-sidebar">
          <div className="codespace-section">
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
          </div>

          <div className="codespace-section">
            <div className="section-header">
              <h3>Explorer</h3>
              <button className="icon-btn" onClick={createFile}>+</button>
            </div>
            <div className="codespace-files">
              {editorFiles.map((file) => (
                <div
                  key={file.path}
                  className={`codespace-file ${activeFile.path === file.path ? 'active' : ''}`}
                >
                  <button onClick={() => setActiveFile(file)}>{file.path}</button>
                  <button className="link-danger" onClick={() => deleteFile(file.path)}>x</button>
                </div>
              ))}
            </div>
          </div>

          <div className="codespace-section">
            <h3>Notes</h3>
            <textarea
              value={saveMessage}
              onChange={(e) => setSaveMessage(e.target.value)}
              placeholder="Add a save message..."
              rows="4"
            />
          </div>
        </aside>

        <main className="codespaces-editor flame-editor">
          {activeName ? (
            <>
              <div className="codespace-header flame-header">
                <div>
                  <h3>{activeName}</h3>
                  <p>Persistent user-specific codespace with Flame-inspired layout.</p>
                </div>
              </div>
              <div className="codespace-body">
                <div className="codespace-editor-pane">
                  <div className="editor-label">{activeFile.path}</div>
                  <div ref={editorRef} className="monaco-host" />
                </div>
                <div className="codespace-preview-pane">
                  <div className="preview-header">Preview</div>
                  <iframe title="preview" srcDoc={previewHtml} />
                </div>
              </div>
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
