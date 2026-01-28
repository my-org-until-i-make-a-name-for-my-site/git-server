# Git Platform

A scalable, self-hosted Git platform built with Node.js that provides repository hosting, organization management, and integrated code editing capabilities.

## Features

- 🔐 **User Authentication**: Secure registration and login system with JWT tokens
- 👥 **Organizations**: Create and manage organizations with multiple members
- 📦 **Git Repositories**: Full Git functionality with high compression for minimal storage
- 🌐 **Git Clone Support**: Native git clone/push/pull via HTTP
- 💻 **VSCode Web Editor**: Integrated VSCode editor for code editing
- 🤖 **Command Execution Agent**: Execute workflows and terminal commands (admin only)
- 🔑 **Admin System**: First user automatically becomes admin
- 🗃️ **SQLite Database**: Lightweight and portable database

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd git-server
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment (copy .env.example to .env and modify as needed):
```bash
cp .env.example .env
```

4. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000` by default.

## Configuration

Edit the `.env` file to configure:

- `PORT`: Server port (default: 3000)
- `JWT_SECRET`: Secret key for JWT tokens (change in production!)
- `REPOS_BASE_PATH`: Base path for storing repositories (default: /mnt/repos)
- `DATABASE_PATH`: SQLite database file path (default: ./data/database.sqlite)

## Usage

### First User Setup

The first user to register will automatically become an admin with additional privileges:
- Access to the command execution agent
- System management capabilities

### Creating Repositories

1. Log in to the web interface
2. Navigate to the "Repositories" tab
3. Click "+ Create Repository"
4. Choose between personal or organization repository
5. Fill in repository details

Repositories are stored at: `/mnt/repos/{owner}/{repo-name}`

### Git Clone

Once a repository is created, you can clone it using standard git:

```bash
git clone http://localhost:3000/git/{owner}/{repo-name}
```

### Organizations

1. Navigate to the "Organizations" tab
2. Click "+ Create Organization"
3. Add members and manage permissions

### Code Editor

The integrated VSCode Web editor allows you to edit code directly in the browser:
- Navigate to the "Code Editor" tab
- Open your repository files
- Edit and save changes

### Command Execution Agent (Admin Only)

Admins can execute commands and workflows:
1. Navigate to the "Agent" tab
2. Select a command (git, npm, node, etc.)
3. Provide arguments and working directory
4. Execute and view results

## Repository Compression

Repositories are configured with maximum compression to minimize storage:
- Core compression: 9
- Loose compression: 9
- Pack compression: 9

This ensures minimal disk space usage while maintaining full git functionality.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Repositories
- `POST /api/repositories` - Create repository
- `GET /api/repositories` - List user's repositories
- `GET /api/repositories/:owner/:repo` - Get repository details
- `GET /api/repositories/:owner/:repo/files` - List repository files

### Organizations
- `POST /api/organizations` - Create organization
- `GET /api/organizations` - List user's organizations
- `GET /api/organizations/:name` - Get organization details
- `GET /api/organizations/:name/members` - Get organization members
- `POST /api/organizations/:name/members` - Add organization member

### Agent (Admin Only)
- `POST /api/agent/execute` - Execute single command
- `POST /api/agent/workflow` - Execute workflow (multiple commands)
- `GET /api/agent/system-info` - Get system information

### Git HTTP Backend
- `/git/:owner/:repo` - Git HTTP smart protocol endpoint

## Security

- Passwords are hashed using bcrypt
- JWT tokens for authentication
- Admin-only command execution
- Whitelisted commands for agent execution
- Command timeout protection (60 seconds)

## Technology Stack

- **Backend**: Node.js, Express
- **Database**: SQLite3
- **Git**: isomorphic-git
- **Authentication**: JWT, bcryptjs
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Code Editor**: VSCode Web (embedded)

## Storage Structure

```
/mnt/repos/
├── username1/
│   ├── repo1/
│   └── repo2/
├── username2/
│   └── repo3/
└── org-name/
    └── org-repo/
```

## Development

Run in development mode:
```bash
npm run dev
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.