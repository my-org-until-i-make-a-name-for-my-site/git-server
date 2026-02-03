# Codara - Self-Hosted Git Platform

A comprehensive, scalable, self-hosted Git platform built entirely in JavaScript. Codara provides a complete development environment with repository hosting, CI/CD pipelines, real-time collaboration, and distributed cluster execution.

![Codara Logo](https://github.com/user-attachments/assets/0c2a2bb8-8159-4eeb-955d-7d2f10c3ecfc)

## 🌟 Key Features

### 🎨 Modern User Interface
- **React-based Frontend**: Built with Vite for lightning-fast development
- **Dark/Light Themes**: Toggle between themes with persistent preference
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Beautiful UI**: GitHub-inspired modern interface

### 🔐 User Management
- **Authentication**: Secure JWT-based auth with configurable password hashing (bcrypt/argon2)
- **Role System**: Admin, Moderator, and User roles
- **First User = Admin**: Automatic admin privileges for initial user
- **User Profiles**: Follow system with followers/following
- **Organizations**: Create and manage organizations with team collaboration

### 📦 Git Repository Hosting
- **Full Git Support**: Clone, push, pull via HTTP
- **High Compression**: Maximum compression (level 9) for minimal storage
- **Issues & Pull Requests**: Complete issue tracking and PR system
- **Branches**: Create and manage branches
- **Commit History**: Full git log integration
- **Contributors**: Track contributions from git log
- **Collaborators**: Add team members with permissions (read/write)

### 💻 Integrated Code Editor
- **Web Editor**: Lightweight in-browser editor optimized for mobile and desktop
- **File Browser**: Navigate folders and files with syntax highlighting
- **Line Numbers**: Professional code viewing
- **Edit & Commit**: Edit files, create/delete files, and commit back to repository

### 🚀 CI/CD Pipeline System
- **Job-based Execution**: Jobs stored in `Z:/mnt/runners/jobs/{job_id}/`
- **Live Log Streaming**: Real-time logs from clusters via WebSocket
- **Artifact Collection**: Automatic build artifact archiving
- **Dependency Installation**: Auto-install npm, pip, bundle dependencies
- **Stage-based Pipelines**: Configure multi-stage pipelines

### 🖥️ Distributed Cluster System
- **Auto-Discovery**: UDP broadcast + full network IP scanning
- **High/Low Power Classification**: 16GB+ memory = high power
- **Permission-based Access**: User/org require explicit permission for high power clusters
- **Load Balancing**: Resource-based task scheduling
- **Failover & Redundancy**: Auto-reschedule on cluster failure
- **Shared Storage**: All data on `Z:/mnt/` (configurable)

### 🔍 Search & Discovery
- **Global Search**: Search repositories, organizations, and users
- **Filter Tabs**: All, Repos, Orgs, Users
- **Explore Page**: Trending and recently created repositories
- **Real-time**: Debounced search with instant results

### 🔔 Notifications
- **Real-time Updates**: WebSocket-based notifications
- **Notification Types**: Follows, issues, PRs, mentions, comments
- **Mark as Read**: Individual and bulk actions
- **Badge Count**: Unread notification counter

### 🛠️ Admin Panel
- **User Management**: Promote/demote users to admin/moderator
- **Repository Overview**: View all repositories
- **Organization Management**: View all organizations
- **Platform Statistics**: Users, repos, orgs, active clusters
- **Search**: Integrated search in each tab

## 📸 Screenshots

### Login Page
![Login](https://github.com/user-attachments/assets/0c2a2bb8-8159-4eeb-955d-7d2f10c3ecfc)

### Signup Page
![Signup](https://github.com/user-attachments/assets/f0cf415a-221c-4244-ba59-6db1672510ed)

### Dashboard (Dark Theme)
![Dashboard Dark](https://github.com/user-attachments/assets/f331e982-0fa5-4b4f-8f9c-25874d104df8)

### Dashboard (Light Theme)
![Dashboard Light](https://github.com/user-attachments/assets/9d2b269c-13b0-4ebd-8128-c719db8d1666)

### Admin Panel
![Admin Panel](https://github.com/user-attachments/assets/10b65526-4169-41d0-94b4-98841057d894)

### Search Page
![Search](https://github.com/user-attachments/assets/533da9aa-9cc2-485f-90d2-58160c0af0c4)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-org/codara.git
cd codara
```

2. **Install server dependencies**
```bash
npm install
```

3. **Install client dependencies and build**
```bash
cd client
npm install
npm run build
cd ..
```

4. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

5. **Start the server**
```bash
npm start
```

The platform will be available at `http://localhost:3000`

## ⚙️ Configuration

### Environment Variables (`.env`)

```env
# Server
PORT=3000
NODE_ENV=production

# Security
JWT_SECRET=your-secret-key-change-this
PASSWORD_HASH_TYPE=bcrypt  # or argon2

# Database (SQLite or PostgreSQL)
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/database.sqlite

# Storage (use Z:/mnt/ for network storage in production)
REPOS_BASE_PATH=./repos
JOBS_BASE_PATH=./mnt/runners/jobs

# Clusters
ENABLE_CLUSTER_DISCOVERY=true
CLUSTER_DISCOVERY_PORT=4001
CLUSTER_SECRET=your-cluster-secret

# Redis (optional, for task queue)
USE_REDIS=false
REDIS_HOST=localhost
REDIS_PORT=6379

# VSCode Editor
ENABLE_WEB_EDITOR=true
DISABLE_TERMINAL=true
```

### Configuration File (`Z:/mnt/app.ini` or `./config/app.ini`)

```ini
[general]
app_name = Codara
version = 1.0.0

[admin]
initial_admin_email = admin@localhost
allow_user_registration = true

[security]
password_hash_type = bcrypt
jwt_secret = your-secret

[storage]
repos_base_path = Z:/mnt/repos
jobs_base_path = Z:/mnt/runners/jobs

[clusters]
enable_discovery = true
cluster_secret = your-cluster-secret

[editor]
enable_web_editor = true
disable_terminal = true

[features]
enable_issues = true
enable_pull_requests = true
enable_cicd = true

[limits]
max_repo_size_gb = 10
max_file_size_mb = 100
```

## 🏗️ Architecture

```
Codara Platform
├── Frontend (React + Vite)
│   ├── Authentication pages
│   ├── Dashboard
│   ├── Repository browser
│   ├── File browser with VSCode
│   ├── Admin panel
│   ├── Search & Explore
│   └── User profiles
│
├── Backend (Node.js + Express)
│   ├── REST API
│   ├── Git HTTP server
│   ├── WebSocket (collaboration, logs)
│   ├── Authentication & Authorization
│   └── Database (SQLite/PostgreSQL)
│
├── Cluster System
│   ├── Cluster agent (cluster/ directory)
│   ├── Auto-discovery service
│   ├── Task scheduler
│   └── Job executor
│
└── Shared Storage (Z:/mnt/)
    ├── repos/{user}/{repo}/
    ├── runners/jobs/{job_id}/
    └── artifacts/
```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Repositories
- `POST /api/repositories` - Create repository
- `GET /api/repositories` - List repositories
- `GET /api/repositories/:owner/:repo` - Get repository
- `GET /api/:owner/:repo/tree/:branch` - Browse files
- `GET /api/:owner/:repo/contents/:branch/:file` - Get file content
- `GET /api/:owner/:repo/commits` - List commits
- `GET /api/:owner/:repo/branches` - List branches
- `POST /api/:owner/:repo/branches` - Create branch
- `GET /api/:owner/:repo/contributors` - Get contributors
- `GET /api/:owner/:repo/collaborators` - Get collaborators
- `POST /api/:owner/:repo/collaborators` - Add collaborator

### Issues & Pull Requests
- `POST /api/:owner/:repo/issues` - Create issue
- `GET /api/:owner/:repo/issues` - List issues
- `POST /api/:owner/:repo/pulls` - Create PR
- `GET /api/:owner/:repo/pulls` - List PRs
- `POST /api/:owner/:repo/pulls/:number/merge` - Merge PR

### Organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations` - List organizations
- `GET /api/organizations/:name` - Get organization
- `POST /api/organizations/:name/follow` - Follow organization

### Users
- `GET /api/profile/:username` - Get user profile
- `POST /api/profile/:username/follow` - Follow user
- `GET /api/profile/:username/followers` - Get followers
- `GET /api/profile/:username/following` - Get following

### Admin
- `GET /api/admin/users` - List all users
- `POST /api/admin/users/:username/promote-admin` - Promote to admin
- `POST /api/admin/users/:username/promote-moderator` - Promote to moderator
- `POST /api/admin/users/:username/demote` - Demote user
- `GET /api/admin/repositories` - List all repositories
- `GET /api/admin/stats` - Platform statistics

### Search & Explore
- `GET /api/search?q=query&type=all|repos|orgs|users` - Search
- `GET /api/explore` - Trending and recent repos

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all as read

### CI/CD
- `POST /api/cicd/pipeline` - Create CI pipeline
- `POST /api/cicd/deploy` - Deploy application
- `GET /api/cicd/jobs` - List jobs
- `GET /api/cicd/jobs/:id/logs` - Get job logs

### Clusters
- `GET /api/clusters` - List discovered clusters
- `POST /api/clusters/:id/assign-task` - Assign task to cluster

### Web Editor
- `GET /api/:owner/:repo/contents/:branch/:file` - Read file content
- `POST /api/:owner/:repo/contents/:branch/:file` - Create/update file
- `DELETE /api/:owner/:repo/contents/:branch/:file` - Delete file

### Git HTTP Protocol
- `/:owner/:repo/*` - Git smart HTTP protocol (supports optional `.git`)
- `/git/:owner/:repo/*` - Legacy Git smart HTTP protocol

## 🔧 Cluster Setup

### Installing Cluster Agent

1. **Copy cluster directory to remote machine**
```bash
scp -r cluster/ user@cluster-machine:/path/to/cluster
```

2. **Install dependencies on cluster**
```bash
cd /path/to/cluster
npm install
```

3. **Configure cluster**
```bash
cp .env.example .env
# Edit .env with cluster configuration
```

4. **Install as system service**
```bash
sudo node install-service.js
```

5. **Start cluster agent**
```bash
sudo systemctl start codara-cluster
```

The cluster will automatically:
- Broadcast its presence on the network
- Report available resources (CPU, memory)
- Execute jobs from shared storage
- Stream logs back to main server

## 📚 Usage Guide

### Creating a Repository

1. Login to Codara
2. Click "+ New Repository"
3. Fill in repository details
4. Choose visibility (public/private)
5. Clone and start coding!

```bash
git clone http://localhost:3000/username/repo-name
cd repo-name
# Make changes
git add .
git commit -m "Initial commit"
git push origin main
```

### Using VSCode Editor

1. Navigate to any repository
2. Click "Browse Files"
3. Click "🚀 Open in VSCode"
4. Edit files in the integrated editor
5. Changes auto-save and can be committed

### Setting up CI/CD

1. Create `.codara-ci.yml` in your repository
2. Define pipeline stages
3. Push to trigger pipeline
4. Monitor live logs in web UI

Example `.codara-ci.yml`:
```yaml
stages:
  - build
  - test
  - deploy

build:
  script:
    - npm install
    - npm run build
  artifacts:
    - dist/

test:
  script:
    - npm test

deploy:
  script:
    - npm run deploy
  only:
    - main
```

## 🔒 Security

- **Password Hashing**: Bcrypt or Argon2
- **JWT Tokens**: Secure authentication
- **CSRF Protection**: Built-in CSRF prevention
- **XSS Protection**: Sanitized inputs
- **Cluster Authentication**: Secret-based auth
- **Permission System**: Role-based access control

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

ISC License

## 🙏 Credits

Built with:
- React & Vite
- Express.js
- Socket.io
- Simple-git
- Bull queue
- SQLite3
- And many other amazing open-source projects

---

**Codara** - Because your code deserves a better home. 🏠✨
