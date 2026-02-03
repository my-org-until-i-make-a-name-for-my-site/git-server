const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

const dbPath = process.env.DATABASE_PATH || './data/database.sqlite';

// Ensure the directory exists
fs.ensureDirSync(path.dirname(dbPath));

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initDatabase();
    }
});

function initDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_admin INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        banned_at DATETIME,
        banned_by INTEGER,
        dob TEXT,
        country TEXT,
        can_use_high_power_clusters INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (banned_by) REFERENCES users(id)
      )
    `);

        // IP Bans table
        db.run(`
      CREATE TABLE IF NOT EXISTS ip_bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT UNIQUE NOT NULL,
        reason TEXT,
        banned_by INTEGER NOT NULL,
        banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (banned_by) REFERENCES users(id)
      )
    `);

        // Ban history table
        db.run(`
      CREATE TABLE IF NOT EXISTS ban_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ip_address TEXT,
        action TEXT NOT NULL,
        reason TEXT,
        performed_by INTEGER NOT NULL,
        performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
      )
    `);

        // Organizations table
        db.run(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT,
        description TEXT,
        owner_id INTEGER NOT NULL,
        can_use_high_power_clusters INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `);

        // Organization members
        db.run(`
      CREATE TABLE IF NOT EXISTS org_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (org_id) REFERENCES organizations(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(org_id, user_id)
      )
    `);

        // Repositories table
        db.run(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        owner_type TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        path TEXT UNIQUE NOT NULL,
        is_private INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      )
    `);

        // Repository collaborators
        db.run(`
      CREATE TABLE IF NOT EXISTS repo_collaborators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        permission TEXT DEFAULT 'read',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(repo_id, user_id)
      )
    `);

        // User followers
        db.run(`
      CREATE TABLE IF NOT EXISTS user_followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        follower_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (follower_id) REFERENCES users(id),
        UNIQUE(user_id, follower_id)
      )
    `);

        // Organization followers
        db.run(`
      CREATE TABLE IF NOT EXISTS org_followers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (org_id) REFERENCES organizations(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(org_id, user_id)
      )
    `);

        // Issues
        db.run(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        issue_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        state TEXT DEFAULT 'open',
        author_id INTEGER NOT NULL,
        assignee_id INTEGER,
        closed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (assignee_id) REFERENCES users(id),
        UNIQUE(repo_id, issue_number)
      )
    `);

        // Issue comments
        db.run(`
      CREATE TABLE IF NOT EXISTS issue_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES issues(id),
        FOREIGN KEY (author_id) REFERENCES users(id)
      )
    `);

        // Pull requests
        db.run(`
      CREATE TABLE IF NOT EXISTS pull_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        pr_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        state TEXT DEFAULT 'open',
        head_branch TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        assignee_id INTEGER,
        merged INTEGER DEFAULT 0,
        merged_at DATETIME,
        merged_by_id INTEGER,
        closed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (assignee_id) REFERENCES users(id),
        FOREIGN KEY (merged_by_id) REFERENCES users(id),
        UNIQUE(repo_id, pr_number)
      )
    `);

        // PR comments
        db.run(`
      CREATE TABLE IF NOT EXISTS pr_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pr_id) REFERENCES pull_requests(id),
        FOREIGN KEY (author_id) REFERENCES users(id)
      )
    `);

        // Issue labels
        db.run(`
      CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#000000',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        UNIQUE(repo_id, name)
      )
    `);

        // Issue-Label relationship
        db.run(`
      CREATE TABLE IF NOT EXISTS issue_labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL,
        label_id INTEGER NOT NULL,
        FOREIGN KEY (issue_id) REFERENCES issues(id),
        FOREIGN KEY (label_id) REFERENCES labels(id),
        UNIQUE(issue_id, label_id)
      )
    `);

        // Commits
        db.run(`
      CREATE TABLE IF NOT EXISTS commits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        sha TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_id INTEGER,
        message TEXT NOT NULL,
        branch TEXT,
        parent_sha TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        FOREIGN KEY (author_id) REFERENCES users(id),
        UNIQUE(repo_id, sha)
      )
    `);

        // Push events
        db.run(`
      CREATE TABLE IF NOT EXISTS push_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        ref TEXT NOT NULL,
        before_sha TEXT,
        after_sha TEXT,
        commit_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

        // Repository branches
        db.run(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        head_sha TEXT,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repo_id) REFERENCES repositories(id),
        UNIQUE(repo_id, name)
      )
    `);

        // User settings
        db.run(`
          CREATE TABLE IF NOT EXISTS user_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            ai_usage REAL DEFAULT 0,
            email_notifications INTEGER DEFAULT 1,
            theme_preference TEXT DEFAULT 'dark',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // Codespaces
        db.run(`
          CREATE TABLE IF NOT EXISTS codespaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            content TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, name)
          )
        `);

        // PR reviews
        db.run(`
          CREATE TABLE IF NOT EXISTS pr_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pr_id INTEGER NOT NULL,
            reviewer_id INTEGER NOT NULL,
            state TEXT NOT NULL,
            body TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pr_id) REFERENCES pull_requests(id),
            FOREIGN KEY (reviewer_id) REFERENCES users(id)
          )
        `);

        // Notifications
        db.run(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // AI chats
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // AI messages
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chat_id) REFERENCES ai_chats(id)
          )
        `);

        // AI attachments
        db.run(`
          CREATE TABLE IF NOT EXISTS ai_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES ai_messages(id)
          )
        `);

        // Workflow runs
        db.run(`
          CREATE TABLE IF NOT EXISTS workflow_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id INTEGER NOT NULL,
            workflow_name TEXT NOT NULL,
            event TEXT NOT NULL,
            status TEXT DEFAULT 'running',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (repo_id) REFERENCES repositories(id)
          )
        `);

        // Workflow jobs
        db.run(`
          CREATE TABLE IF NOT EXISTS workflow_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            job_name TEXT NOT NULL,
            status TEXT DEFAULT 'running',
            logs TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
          )
        `);

        console.log('Database schema initialized');
    });
}

module.exports = db;
