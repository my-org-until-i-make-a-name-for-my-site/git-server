import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { SettingsIcon } from '../components/Icons'
import './Settings.css'

function Settings({ user, logout }) {
    const [settings, setSettings] = useState({
        ai_usage: 0,
        email_notifications: true,
        theme_preference: 'dark'
    })
    const [loading, setLoading] = useState(true)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            const token = localStorage.getItem('token')
            const response = await fetch('/api/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await response.json()
            setSettings(data)
            setLoading(false)
        } catch (err) {
            console.error('Failed to load settings:', err)
            setLoading(false)
        }
    }

    const saveSettings = async () => {
        try {
            const token = localStorage.getItem('token')
            await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            })
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            console.error('Failed to save settings:', err)
            alert('Failed to save settings')
        }
    }

    if (loading) {
        return (
            <div>
                <Header user={user} logout={logout} />
                <div className="container">Loading...</div>
            </div>
        )
    }

    return (
        <div className="settings-page">
            <Header user={user} logout={logout} />

            <div className="settings-container">
                <div className="settings-header">
                    <div className="settings-title">
                        <SettingsIcon />
                        <h1>Settings</h1>
                    </div>
                </div>

                <div className="settings-content">
                    {/* AI Usage Section */}
                    <div className="settings-section">
                        <h2>AI Usage</h2>
                        <div className="settings-card">
                            <div className="usage-stat">
                                <div className="usage-label">
                                    <span>Current Usage</span>
                                    <span className="usage-value">{settings.ai_usage?.toFixed(2) || 0}%</span>
                                </div>
                                <div className="usage-bar">
                                    <div
                                        className="usage-bar-fill"
                                        style={{ width: `${Math.min(settings.ai_usage || 0, 100)}%` }}
                                    />
                                </div>
                                <p className="usage-info">
                                    1 character = 0.002% usage • Limit: 100%
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Account Settings */}
                    <div className="settings-section">
                        <h2>Account</h2>
                        <div className="settings-card">
                            <div className="settings-item">
                                <label className="settings-label">Username</label>
                                <input
                                    type="text"
                                    value={user.username}
                                    disabled
                                    className="settings-input disabled"
                                />
                            </div>
                            <div className="settings-item">
                                <label className="settings-label">Email</label>
                                <input
                                    type="email"
                                    value={user.email}
                                    disabled
                                    className="settings-input disabled"
                                />
                            </div>
                            <div className="settings-item">
                                <label className="settings-label">Role</label>
                                <input
                                    type="text"
                                    value={user.role || 'user'}
                                    disabled
                                    className="settings-input disabled"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notifications */}
                    <div className="settings-section">
                        <h2>Notifications</h2>
                        <div className="settings-card">
                            <div className="settings-item">
                                <label className="settings-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={settings.email_notifications}
                                        onChange={(e) => setSettings({ ...settings, email_notifications: e.target.checked })}
                                    />
                                    <span>Email notifications</span>
                                </label>
                                <p className="settings-description">
                                    Receive email notifications for issues, pull requests, and mentions
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Theme Preference */}
                    <div className="settings-section">
                        <h2>Appearance</h2>
                        <div className="settings-card">
                            <div className="settings-item">
                                <label className="settings-label">Theme</label>
                                <select
                                    value={settings.theme_preference || 'dark'}
                                    onChange={(e) => setSettings({ ...settings, theme_preference: e.target.value })}
                                    className="settings-select"
                                >
                                    <option value="dark">Dark</option>
                                    <option value="light">Light</option>
                                    <option value="auto">Auto</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="settings-actions">
                        <button onClick={saveSettings} className="settings-save-btn">
                            {saved ? 'Saved!' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Settings
