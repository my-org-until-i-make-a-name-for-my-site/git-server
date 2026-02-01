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

module.exports = router;
