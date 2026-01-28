# Live Collaboration Guide

## Overview

Codara supports real-time collaboration for contributors working on the same project. When multiple contributors are online in the same VSCode editor, they can see each other's changes, cursors, and selections in real-time.

## How It Works

### WebSocket Connection

The platform uses Socket.io for real-time communication:

1. **User joins project**: When a contributor opens a project in VSCode editor
2. **Presence broadcast**: Other online contributors are notified
3. **Live updates**: File changes, cursor movements, and selections are shared
4. **Chat**: Project-specific chat for coordination

### Prerequisites

To use live collaboration:
- User must be a **collaborator** on the repository (read or write permission)
- VSCode editor must be active for the project
- WebSocket connection established

## Features

### Real-time Cursor Tracking

See other contributors' cursors in real-time:
- Each user has a unique color
- Cursor position updates as users type
- Cursor disappears when user is idle

### Live File Changes

See edits as they happen:
- Character-by-character updates
- Operational transformation prevents conflicts
- Changes are synchronized across all active sessions

### User Presence

Know who's online:
- Active users list in the sidebar
- User avatars and names
- Online/offline status indicators

### Project Chat

Communicate without leaving the editor:
- Send messages to all online contributors
- See typing indicators
- Message history persists during session

## Usage

### Step 1: Add Collaborators

Repository owner must add collaborators first:

```bash
# Via API
POST /api/:owner/:repo/collaborators
{
  "username": "contributor_username",
  "permission": "write"  # or "read"
}
```

Or through the web UI:
1. Navigate to repository settings
2. Click "Collaborators"
3. Add user with appropriate permission

### Step 2: Open VSCode Editor

Both users open the VSCode editor:

1. Navigate to repository
2. Click "Browse Files"
3. Click "🚀 Open in VSCode"

### Step 3: Start Collaborating

Once both users are in the editor:
- See each other in the "Online Users" panel
- Open the same file to see live cursors
- Make edits and watch them sync
- Use chat for communication

## WebSocket Events

### Client → Server

- `join_project` - Join project collaboration session
- `leave_project` - Leave collaboration session
- `file_change` - Broadcast file changes
- `cursor_move` - Share cursor position
- `send_message` - Send chat message

### Server → Client

- `user_joined` - User joined the project
- `user_left` - User left the project
- `room_users` - List of online users
- `file_changed` - File was changed by another user
- `cursor_moved` - Cursor moved by another user
- `new_message` - New chat message

## Code Example

### Connecting to Collaboration

```javascript
// In your VSCode editor integration
import io from 'socket.io-client';

const token = localStorage.getItem('token');
const socket = io('http://localhost:3000', {
  auth: { token }
});

// Join project
socket.emit('join_project', `${owner}/${repo}`);

// Listen for other users
socket.on('user_joined', (user) => {
  console.log(`${user.username} joined`);
  showUserPresence(user);
});

socket.on('user_left', (user) => {
  console.log(`${user.username} left`);
  hideUserPresence(user);
});

// Share file changes
editor.onDidChangeModelContent((event) => {
  socket.emit('file_change', {
    projectId: `${owner}/${repo}`,
    filePath: currentFile,
    changes: event.changes
  });
});

// Receive file changes
socket.on('file_changed', ({ userId, username, filePath, changes }) => {
  if (filePath === currentFile && userId !== myUserId) {
    applyChanges(changes);
    showUserIndicator(username);
  }
});

// Share cursor position
editor.onDidChangeCursorPosition((event) => {
  socket.emit('cursor_move', {
    projectId: `${owner}/${repo}`,
    filePath: currentFile,
    position: event.position
  });
});

// Show other cursors
socket.on('cursor_moved', ({ userId, username, filePath, position }) => {
  if (filePath === currentFile && userId !== myUserId) {
    showCursor(userId, username, position);
  }
});
```

### Chat Integration

```javascript
// Send message
function sendMessage(message) {
  socket.emit('send_message', {
    projectId: `${owner}/${repo}`,
    message
  });
}

// Receive messages
socket.on('new_message', ({ userId, username, message, timestamp }) => {
  appendChatMessage(username, message, timestamp);
});
```

## Security

### Authentication

- All WebSocket connections require valid JWT token
- Token verified before joining any project

### Authorization

- Only collaborators can join project sessions
- Permission levels enforced (read vs write)
- File changes validated against permissions

### Rate Limiting

- Cursor updates throttled (max 30/second)
- File changes debounced (min 100ms between updates)
- Chat messages rate-limited (max 10/minute)

## Performance

### Optimizations

- **Cursor throttling**: Reduce network traffic for rapid movements
- **Change batching**: Group rapid edits into single updates
- **Selective broadcasting**: Only send to users viewing the same file
- **Compression**: Gzip WebSocket messages for large changes

### Scalability

For high user counts:
- Use Redis adapter for Socket.io to scale across multiple servers
- Implement room sharding for very large projects
- Add dedicated collaboration servers

```javascript
// Enable Redis adapter
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const pubClient = createClient({ host: 'localhost', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

## Troubleshooting

### Connection Issues

**Problem**: Can't connect to collaboration
- Check network connectivity
- Verify JWT token is valid
- Ensure WebSocket port is open (default: 3000)

**Problem**: Changes not syncing
- Check you're a collaborator
- Verify both users viewing same file
- Check browser console for errors

### Performance Issues

**Problem**: Lag when typing
- Increase debounce interval
- Reduce cursor update frequency
- Check network latency

**Problem**: High memory usage
- Clear old cursor decorations
- Limit message history
- Close unused files

## Best Practices

1. **Communicate**: Use chat to coordinate who's editing what
2. **Small commits**: Save and commit frequently
3. **Refresh**: Periodically refresh if experiencing issues
4. **Conflicts**: Use git to resolve any merge conflicts
5. **Permissions**: Only grant write access to trusted collaborators

## Future Enhancements

- [ ] Conflict resolution UI
- [ ] Change history with undo/redo across users
- [ ] Voice/video chat integration
- [ ] Screen sharing
- [ ] Collaborative debugging
- [ ] Pair programming mode with shared control

## Support

For issues or questions:
- GitHub Issues: [project-url]/issues
- Documentation: [project-url]/docs
- Email: support@codara.dev
