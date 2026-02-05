const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const buildPromptFromMessages = (messages) => {
    return messages
        .map(msg => {
            const roleLabel = msg.role === 'assistant' ? 'Assistant' : 'User';
            let content = `${roleLabel}: ${msg.content}`;
            if (msg.attachments && msg.attachments.length > 0) {
                const attachmentLines = msg.attachments.map(att => (
                    `- ${att.name} (${att.mime_type}) [base64]: ${att.data}`
                ));
                content += `\nAttachments:\n${attachmentLines.join('\n')}`;
            }
            return content;
        })
        .join('\n\n');
};

// List chats
router.get('/chats', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.all(
        'SELECT id, title, created_at, updated_at FROM ai_chats WHERE user_id = ? ORDER BY updated_at DESC',
        [userId],
        (err, chats) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to load chats' });
            }
            res.json({ chats });
        }
    );
});

// Create chat
router.post('/chats', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { title } = req.body;
    const chatTitle = title && title.trim() ? title.trim() : 'New Chat';

    db.run(
        'INSERT INTO ai_chats (user_id, title) VALUES (?, ?)',
        [userId, chatTitle],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create chat' });
            }
            res.json({ chat: { id: this.lastID, title: chatTitle } });
        }
    );
});

// Update chat title
router.patch('/chats/:chatId', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
    }

    db.run(
        'UPDATE ai_chats SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [title.trim(), chatId, userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update chat' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Chat not found' });
            }
            res.json({ success: true, title: title.trim() });
        }
    );
});

// Get chat with messages and attachments
router.get('/chats/:chatId', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;

    db.get(
        'SELECT id, title FROM ai_chats WHERE id = ? AND user_id = ?',
        [chatId, userId],
        (err, chat) => {
            if (err || !chat) {
                return res.status(404).json({ error: 'Chat not found' });
            }

            db.all(
                'SELECT id, role, content, created_at FROM ai_messages WHERE chat_id = ? ORDER BY created_at ASC',
                [chatId],
                (err, messages) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to load messages' });
                    }

                    const messageIds = messages.map(m => m.id);
                    if (messageIds.length === 0) {
                        return res.json({ chat, messages: [] });
                    }

                    const placeholders = messageIds.map(() => '?').join(',');
                    db.all(
                        `SELECT id, message_id, name, mime_type, data FROM ai_attachments WHERE message_id IN (${placeholders})`,
                        messageIds,
                        (err, attachments) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to load attachments' });
                            }

                            const attachmentsByMessage = attachments.reduce((acc, att) => {
                                if (!acc[att.message_id]) acc[att.message_id] = [];
                                acc[att.message_id].push(att);
                                return acc;
                            }, {});

                            const enriched = messages.map(m => ({
                                ...m,
                                attachments: attachmentsByMessage[m.id] || []
                            }));

                            res.json({ chat, messages: enriched });
                        }
                    );
                }
            );
        }
    );
});

// Send message (stores user message, attachments, calls AI with full chat, stores assistant response)
router.post('/chats/:chatId/messages', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { message, attachments = [] } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const usageDelta = message.length * 0.002;
        const usageRow = await new Promise((resolve, reject) => {
            db.get(
                'SELECT ai_usage FROM user_settings WHERE user_id = ?',
                [userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        const currentUsage = usageRow?.ai_usage || 0;
        if (currentUsage + usageDelta > 100) {
            return res.status(429).json({ error: 'Usage limit exceeded' });
        }

        const chat = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, title FROM ai_chats WHERE id = ? AND user_id = ?',
                [chatId, userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const userMessageId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)',
                [chatId, 'user', message],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });

        if (attachments.length > 0) {
            await Promise.all(
                attachments.map(att => new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO ai_attachments (message_id, name, mime_type, data) VALUES (?, ?, ?, ?)',
                        [userMessageId, att.name, att.mime_type, att.data],
                        (err) => (err ? reject(err) : resolve())
                    );
                }))
            );
        }

        const messages = await new Promise((resolve, reject) => {
            db.all(
                'SELECT id, role, content, created_at FROM ai_messages WHERE chat_id = ? ORDER BY created_at ASC',
                [chatId],
                (err, rows) => (err ? reject(err) : resolve(rows))
            );
        });

        const messageIds = messages.map(m => m.id);
        const attachmentsRows = messageIds.length
            ? await new Promise((resolve, reject) => {
                const placeholders = messageIds.map(() => '?').join(',');
                db.all(
                    `SELECT id, message_id, name, mime_type, data FROM ai_attachments WHERE message_id IN (${placeholders})`,
                    messageIds,
                    (err, rows) => (err ? reject(err) : resolve(rows))
                );
            })
            : [];

        const attachmentsByMessage = attachmentsRows.reduce((acc, att) => {
            if (!acc[att.message_id]) acc[att.message_id] = [];
            acc[att.message_id].push(att);
            return acc;
        }, {});

        const enrichedMessages = messages.map(m => ({
            ...m,
            attachments: attachmentsByMessage[m.id] || []
        }));

        const fullPrompt = buildPromptFromMessages(enrichedMessages);
        const aiUrl = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`;
        const aiRes = await fetch(aiUrl);
        const aiText = await aiRes.text();

        const assistantMessageId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO ai_messages (chat_id, role, content) VALUES (?, ?, ?)',
                [chatId, 'assistant', aiText],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });

        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE user_settings SET ai_usage = ai_usage + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [usageDelta, userId],
                function (err) {
                    if (err) return reject(err);
                    if (this.changes === 0) {
                        db.run(
                            'INSERT INTO user_settings (user_id, ai_usage) VALUES (?, ?)',
                            [userId, usageDelta],
                            (err) => (err ? reject(err) : resolve())
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });

        db.run(
            'UPDATE ai_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [chatId]
        );

        res.json({
            message: {
                id: assistantMessageId,
                role: 'assistant',
                content: aiText,
                created_at: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('AI chat error:', err);
        res.status(500).json({ error: 'Failed to process AI message' });
    }
});

// Start AI task session
router.post('/task-sessions', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.body;

    try {
        // Get current month usage
        const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
        const MAX_MONTHLY_HOURS = 30;
        const MAX_MONTHLY_SECONDS = MAX_MONTHLY_HOURS * 3600;

        const usageRow = await new Promise((resolve, reject) => {
            db.get(
                'SELECT total_seconds FROM ai_task_usage WHERE user_id = ? AND month = ?',
                [userId, currentMonth],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        const currentUsage = usageRow?.total_seconds || 0;
        if (currentUsage >= MAX_MONTHLY_SECONDS) {
            return res.status(429).json({ 
                error: 'Monthly task session limit reached',
                limit: MAX_MONTHLY_HOURS,
                used: Math.floor(currentUsage / 3600)
            });
        }

        // Create task session
        const sessionId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO ai_task_sessions (user_id, chat_id, status) VALUES (?, ?, ?)',
                [userId, chatId || null, 'active'],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });

        res.json({ 
            sessionId,
            remainingHours: Math.floor((MAX_MONTHLY_SECONDS - currentUsage) / 3600),
            maxHours: MAX_MONTHLY_HOURS
        });
    } catch (err) {
        console.error('Failed to start task session:', err);
        res.status(500).json({ error: 'Failed to start task session' });
    }
});

// End AI task session
router.post('/task-sessions/:sessionId/end', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { sessionId } = req.params;

    try {
        const session = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM ai_task_sessions WHERE id = ? AND user_id = ? AND status = ?',
                [sessionId, userId, 'active'],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!session) {
            return res.status(404).json({ error: 'Active session not found' });
        }

        const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
        const currentMonth = new Date().toISOString().substring(0, 7);

        // Update session
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE ai_task_sessions SET status = ?, duration_seconds = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['ended', duration, sessionId],
                (err) => (err ? reject(err) : resolve())
            );
        });

        // Update monthly usage
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO ai_task_usage (user_id, month, total_seconds) VALUES (?, ?, ?)
                 ON CONFLICT(user_id, month) DO UPDATE SET 
                 total_seconds = total_seconds + ?, updated_at = CURRENT_TIMESTAMP`,
                [userId, currentMonth, duration, duration],
                (err) => (err ? reject(err) : resolve())
            );
        });

        res.json({ 
            success: true,
            duration,
            durationMinutes: Math.floor(duration / 60)
        });
    } catch (err) {
        console.error('Failed to end task session:', err);
        res.status(500).json({ error: 'Failed to end task session' });
    }
});

// Get task session usage
router.get('/task-sessions/usage', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().substring(0, 7);
    const MAX_MONTHLY_HOURS = 30;
    const MAX_MONTHLY_SECONDS = MAX_MONTHLY_HOURS * 3600;

    db.get(
        'SELECT total_seconds FROM ai_task_usage WHERE user_id = ? AND month = ?',
        [userId, currentMonth],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to get usage' });
            }
            const usedSeconds = row?.total_seconds || 0;
            res.json({
                maxHours: MAX_MONTHLY_HOURS,
                usedHours: Math.floor(usedSeconds / 3600),
                usedSeconds,
                remainingHours: Math.floor((MAX_MONTHLY_SECONDS - usedSeconds) / 3600),
                remainingSeconds: MAX_MONTHLY_SECONDS - usedSeconds
            });
        }
    );
});

module.exports = router;
