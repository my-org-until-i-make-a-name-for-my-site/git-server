const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs-extra');
const path = require('path');
const execPromise = util.promisify(exec);

const router = express.Router();

const TASK_SESSION_SYSTEM_PROMPT = `You are an AI assistant for Codara, a self-hosted Git platform. 

CAPABILITIES:
- You have access to a terminal for executing commands, testing code, and pushing changes
- You can browse the web for documentation and information
- You have read access to all repositories in the database
- You have push access ONLY to repositories owned by the current user

TERMINAL USAGE:
To execute terminal commands, use this syntax:
[terminal]command here[/terminal]

Examples:
[terminal]ls -la[/terminal]
[terminal]git clone /path/to/repo[/terminal]
[terminal]cd repo && npm install && npm test[/terminal]

BROWSER SEARCH:
To search the web, use this syntax:
[browsersearch]search query or URL[/browsersearch]

Example:
[browsersearch]https://www.npmjs.com/package/express[/browsersearch]
[browsersearch]how to fix merge conflicts in git[/browsersearch]

GIT WORKFLOW:
1. User provides a repository link/path
2. You read the repository files to understand the codebase
3. User requests code changes
4. You make changes using terminal commands (git clone, edit files, commit, push)
5. You can test changes before pushing

IMPORTANT RULES:
- Always test code before pushing
- Only push to repositories the user owns
- Use descriptive commit messages
- Handle errors gracefully and explain what went wrong
- When asked to make changes, provide clear explanations of what you're doing

Your responses should be helpful, clear, and technically accurate.`;

// Read all files from a repository
async function readRepositoryFiles(repoPath) {
    const files = [];
    const MAX_FILE_SIZE = 100000; // 100KB per file
    const MAX_TOTAL_SIZE = 500000; // 500KB total
    let totalSize = 0;

    const ignoredDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out'];
    const ignoredFiles = ['.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

    async function readDir(dir, relativePath = '') {
        if (totalSize > MAX_TOTAL_SIZE) return;

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (totalSize > MAX_TOTAL_SIZE) break;

                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(relativePath, entry.name);

                if (entry.isDirectory()) {
                    if (!ignoredDirs.includes(entry.name)) {
                        await readDir(fullPath, relPath);
                    }
                } else {
                    if (ignoredFiles.includes(entry.name)) continue;

                    try {
                        const stats = await fs.stat(fullPath);
                        if (stats.size > MAX_FILE_SIZE) continue;

                        const content = await fs.readFile(fullPath, 'utf8');
                        files.push({
                            path: relPath,
                            content: content.substring(0, MAX_FILE_SIZE)
                        });
                        totalSize += content.length;
                    } catch (err) {
                        // Skip files that can't be read (binary, etc.)
                    }
                }
            }
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err);
        }
    }

    if (await fs.pathExists(repoPath)) {
        await readDir(repoPath);
    }

    return files;
}

// Build repository context for AI prompt
async function buildRepositoryContext(chatId) {
    try {
        const repos = await new Promise((resolve, reject) => {
            db.all(
                `SELECT r.id, r.name, r.path,
                        CASE 
                          WHEN r.owner_type = 'user' THEN (SELECT username FROM users WHERE id = r.owner_id)
                          WHEN r.owner_type = 'org' THEN (SELECT name FROM organizations WHERE id = r.owner_id)
                        END as owner
                 FROM ai_chat_repos acr
                 JOIN repositories r ON acr.repo_id = r.id
                 WHERE acr.chat_id = ?`,
                [chatId],
                (err, rows) => (err ? reject(err) : resolve(rows))
            );
        });

        if (repos.length === 0) {
            return '';
        }

        let context = '\n\n=== LINKED REPOSITORIES ===\n';
        
        for (const repo of repos) {
            context += `\nRepository: ${repo.owner}/${repo.name}\n`;
            context += `Path: ${repo.path}\n`;
            context += '\nFILES:\n';

            const files = await readRepositoryFiles(repo.path);
            
            for (const file of files) {
                context += `\n--- ${file.path} ---\n`;
                context += file.content;
                context += '\n';
            }
        }

        context += '\n=== END OF REPOSITORIES ===\n\n';
        return context;
    } catch (err) {
        console.error('Error building repository context:', err);
        return '';
    }
}

const buildPromptFromMessages = async (messages, isTaskSession = false, chatId = null) => {
    const systemPrompt = isTaskSession ? TASK_SESSION_SYSTEM_PROMPT : '';
    
    // Add repository context if chatId is provided
    let repoContext = '';
    if (chatId) {
        repoContext = await buildRepositoryContext(chatId);
    }
    
    const messageContent = messages
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
    
    return systemPrompt + repoContext + messageContent;
};

// Execute terminal command (for task sessions only)
async function executeTerminalCommand(command, userId, sessionId) {
    try {
        // Security: Limit command execution to certain directories and prevent dangerous commands
        const dangerousPatterns = [
            /rm\s+-rf\s+\//,  // Prevent recursive deletion of root
            />\s*\/dev\/sda/,  // Prevent disk writes
            /mkfs/,  // Prevent filesystem formatting
            /dd\s+if=/,  // Prevent dangerous dd commands
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return { 
                    success: false, 
                    output: 'Error: Command blocked for security reasons',
                    error: 'Dangerous command detected'
                };
            }
        }

        // Execute command with timeout
        const { stdout, stderr } = await execPromise(command, {
            timeout: 30000, // 30 second timeout
            maxBuffer: 1024 * 1024, // 1MB buffer
            cwd: path.resolve(process.env.REPOS_BASE_PATH || 'Z:/mnt/repos')
        });

        return {
            success: true,
            output: stdout || stderr || 'Command executed successfully',
            error: stderr
        };
    } catch (error) {
        return {
            success: false,
            output: error.message,
            error: error.stderr || error.message
        };
    }
}

// Fetch URL content (for browser search)
async function fetchWebContent(url) {
    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Codara-AI-Assistant/1.0'
            },
            timeout: 10000
        });
        
        const text = await response.text();
        // Return first 2000 characters to avoid overwhelming the AI
        return text.substring(0, 2000);
    } catch (error) {
        return `Error fetching URL: ${error.message}`;
    }
}

// Process AI response to extract and execute terminal commands and browser searches
async function processAIResponse(content, userId, sessionId, isTaskSession) {
    if (!isTaskSession) {
        return content;
    }

    let processedContent = content;
    
    // Process terminal commands
    const terminalRegex = /\[terminal\](.*?)\[\/terminal\]/gs;
    const terminalMatches = [...content.matchAll(terminalRegex)];
    
    for (const match of terminalMatches) {
        const command = match[1].trim();
        const result = await executeTerminalCommand(command, userId, sessionId);
        const replacement = `[terminal]${command}[/terminal]\n\nTerminal Output:\n\`\`\`\n${result.output}\n\`\`\``;
        processedContent = processedContent.replace(match[0], replacement);
    }
    
    // Process browser searches
    const browserRegex = /\[browsersearch\](.*?)\[\/browsersearch\]/gs;
    const browserMatches = [...content.matchAll(browserRegex)];
    
    for (const match of browserMatches) {
        const query = match[1].trim();
        let result;
        
        // Check if it's a URL or search query
        if (query.startsWith('http://') || query.startsWith('https://')) {
            result = await fetchWebContent(query);
        } else {
            // For search queries, use a search engine URL
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            result = `Search query: ${query}\nSearch URL: ${searchUrl}`;
        }
        
        const replacement = `[browsersearch]${query}[/browsersearch]\n\nSearch Result:\n\`\`\`\n${result}\n\`\`\``;
        processedContent = processedContent.replace(match[0], replacement);
    }
    
    return processedContent;
}

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
        const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
        const usageDelta = message.length * 0.002;
        
        // Get or create user settings with monthly reset logic
        const usageRow = await new Promise((resolve, reject) => {
            db.get(
                'SELECT ai_usage, ai_usage_limit, ai_usage_month FROM user_settings WHERE user_id = ?',
                [userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        let currentUsage = 0;
        let usageLimit = 100;

        if (usageRow) {
            // Check if month has changed - reset if needed
            if (usageRow.ai_usage_month !== currentMonth) {
                // Reset usage for new month
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE user_settings SET ai_usage = 0, ai_usage_month = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                        [currentMonth, userId],
                        (err) => (err ? reject(err) : resolve())
                    );
                });
                currentUsage = 0;
            } else {
                currentUsage = usageRow.ai_usage || 0;
            }
            usageLimit = usageRow.ai_usage_limit || 100;
        } else {
            // Create user settings if doesn't exist
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO user_settings (user_id, ai_usage, ai_usage_limit, ai_usage_month) VALUES (?, 0, 100, ?)',
                    [userId, currentMonth],
                    (err) => (err ? reject(err) : resolve())
                );
            });
        }

        if (currentUsage + usageDelta > usageLimit) {
            return res.status(429).json({ 
                error: 'Usage limit exceeded',
                current: currentUsage,
                limit: usageLimit
            });
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

        // Check if there's an active task session for this chat
        const activeSession = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM ai_task_sessions WHERE chat_id = ? AND status = ? AND user_id = ?',
                [chatId, 'active', userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        const isTaskSession = !!activeSession;
        const sessionId = activeSession?.id;

        // Build initial prompt with repository context
        let fullPrompt = await buildPromptFromMessages(enrichedMessages, isTaskSession, chatId);
        
        // Send to AI and process response iteratively
        let aiText = '';
        let iterationCount = 0;
        const MAX_ITERATIONS = 5; // Prevent infinite loops
        
        while (iterationCount < MAX_ITERATIONS) {
            iterationCount++;
            
            const aiUrl = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}`;
            const aiRes = await fetch(aiUrl);
            aiText = await aiRes.text();

            // Check if AI response contains commands that need execution
            const hasTerminalCommands = /\[terminal\](.*?)\[\/terminal\]/s.test(aiText);
            const hasBrowserCommands = /\[browsersearch\](.*?)\[\/browsersearch\]/s.test(aiText);

            if (!isTaskSession || (!hasTerminalCommands && !hasBrowserCommands)) {
                // No commands to execute, we're done
                break;
            }

            // Execute commands and get results
            const processedText = await processAIResponse(aiText, userId, sessionId, isTaskSession);
            
            // If the processed text is the same, AI didn't use any commands correctly
            if (processedText === aiText) {
                break;
            }

            // Add the command results as a new system message and continue
            enrichedMessages.push({
                id: `system-${Date.now()}`,
                role: 'assistant',
                content: processedText,
                attachments: []
            });

            // Add a prompt asking AI to continue
            enrichedMessages.push({
                id: `system-continue-${Date.now()}`,
                role: 'user',
                content: 'Continue with the task. If you need to run more commands, use the [terminal] or [browsersearch] tags. Otherwise, provide your final response.',
                attachments: []
            });

            // Rebuild prompt for next iteration
            fullPrompt = await buildPromptFromMessages(enrichedMessages, isTaskSession, chatId);
        }

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
                'UPDATE user_settings SET ai_usage = ai_usage + ?, ai_usage_month = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [usageDelta, currentMonth, userId],
                function (err) {
                    if (err) return reject(err);
                    if (this.changes === 0) {
                        db.run(
                            'INSERT INTO user_settings (user_id, ai_usage, ai_usage_limit, ai_usage_month) VALUES (?, ?, 100, ?)',
                            [userId, usageDelta, currentMonth],
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

// Link repository to chat
router.post('/chats/:chatId/repos', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;
    const { owner, repo } = req.body;

    if (!owner || !repo) {
        return res.status(400).json({ error: 'Owner and repo name are required' });
    }

    try {
        // Verify chat belongs to user
        const chat = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM ai_chats WHERE id = ? AND user_id = ?',
                [chatId, userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Find repository
        const repository = await new Promise((resolve, reject) => {
            db.get(
                `SELECT r.* FROM repositories r
                 LEFT JOIN users u ON r.owner_id = u.id AND r.owner_type = 'user'
                 LEFT JOIN organizations o ON r.owner_id = o.id AND r.owner_type = 'org'
                 WHERE r.name = ? AND (u.username = ? OR o.name = ?)`,
                [repo, owner, owner],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!repository) {
            return res.status(404).json({ error: 'Repository not found' });
        }

        // Link repository to chat
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO ai_chat_repos (chat_id, repo_id, user_id) VALUES (?, ?, ?)',
                [chatId, repository.id, userId],
                function (err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint')) {
                            return reject(new Error('Repository already linked to this chat'));
                        }
                        return reject(err);
                    }
                    resolve(this.lastID);
                }
            );
        });

        res.json({
            message: 'Repository linked successfully',
            repo: {
                id: repository.id,
                name: repository.name,
                owner,
                path: repository.path
            }
        });
    } catch (err) {
        console.error('Failed to link repository:', err);
        res.status(500).json({ error: err.message || 'Failed to link repository' });
    }
});

// Get linked repositories for a chat
router.get('/chats/:chatId/repos', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { chatId } = req.params;

    try {
        // Verify chat belongs to user
        const chat = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM ai_chats WHERE id = ? AND user_id = ?',
                [chatId, userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const repos = await new Promise((resolve, reject) => {
            db.all(
                `SELECT r.id, r.name, r.description, r.path, r.owner_type,
                        CASE 
                          WHEN r.owner_type = 'user' THEN (SELECT username FROM users WHERE id = r.owner_id)
                          WHEN r.owner_type = 'org' THEN (SELECT name FROM organizations WHERE id = r.owner_id)
                        END as owner,
                        acr.linked_at
                 FROM ai_chat_repos acr
                 JOIN repositories r ON acr.repo_id = r.id
                 WHERE acr.chat_id = ?
                 ORDER BY acr.linked_at DESC`,
                [chatId],
                (err, rows) => (err ? reject(err) : resolve(rows))
            );
        });

        res.json({ repos });
    } catch (err) {
        console.error('Failed to get linked repos:', err);
        res.status(500).json({ error: 'Failed to get linked repositories' });
    }
});

// Unlink repository from chat
router.delete('/chats/:chatId/repos/:repoId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { chatId, repoId } = req.params;

    try {
        // Verify chat belongs to user
        const chat = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM ai_chats WHERE id = ? AND user_id = ?',
                [chatId, userId],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM ai_chat_repos WHERE chat_id = ? AND repo_id = ?',
                [chatId, repoId],
                function (err) {
                    if (err) return reject(err);
                    if (this.changes === 0) {
                        return reject(new Error('Repository link not found'));
                    }
                    resolve();
                }
            );
        });

        res.json({ message: 'Repository unlinked successfully' });
    } catch (err) {
        console.error('Failed to unlink repository:', err);
        res.status(500).json({ error: err.message || 'Failed to unlink repository' });
    }
});

module.exports = router;
