const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

class CollaborationService {
  constructor(server) {
    this.io = socketIO(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.rooms = new Map(); // projectId -> Set of socket ids
    this.users = new Map(); // socketId -> user info
    this.cursors = new Map(); // projectId -> Map of userId -> cursor position

    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error('Invalid token'));
        }
        socket.user = decoded;
        next();
      });
    });

    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.user.username);
      this.users.set(socket.id, socket.user);

      socket.on('join_project', (projectId) => {
        socket.join(`project:${projectId}`);
        
        if (!this.rooms.has(projectId)) {
          this.rooms.set(projectId, new Set());
        }
        this.rooms.get(projectId).add(socket.id);

        // Notify others in the room
        socket.to(`project:${projectId}`).emit('user_joined', {
          userId: socket.user.id,
          username: socket.user.username
        });

        // Send current users in room
        const roomUsers = Array.from(this.rooms.get(projectId))
          .map(id => this.users.get(id))
          .filter(Boolean);
        
        socket.emit('room_users', roomUsers);
      });

      socket.on('leave_project', (projectId) => {
        socket.leave(`project:${projectId}`);
        
        if (this.rooms.has(projectId)) {
          this.rooms.get(projectId).delete(socket.id);
        }

        socket.to(`project:${projectId}`).emit('user_left', {
          userId: socket.user.id,
          username: socket.user.username
        });
      });

      // Real-time file editing
      socket.on('file_change', (data) => {
        const { projectId, filePath, changes } = data;
        
        socket.to(`project:${projectId}`).emit('file_changed', {
          userId: socket.user.id,
          username: socket.user.username,
          filePath,
          changes
        });
      });

      // Cursor position sharing
      socket.on('cursor_move', (data) => {
        const { projectId, filePath, position } = data;
        
        if (!this.cursors.has(projectId)) {
          this.cursors.set(projectId, new Map());
        }
        
        this.cursors.get(projectId).set(socket.user.id, {
          userId: socket.user.id,
          username: socket.user.username,
          filePath,
          position
        });

        socket.to(`project:${projectId}`).emit('cursor_moved', {
          userId: socket.user.id,
          username: socket.user.username,
          filePath,
          position
        });
      });

      // Chat messages
      socket.on('send_message', (data) => {
        const { projectId, message } = data;
        
        this.io.to(`project:${projectId}`).emit('new_message', {
          userId: socket.user.id,
          username: socket.user.username,
          message,
          timestamp: Date.now()
        });
      });

      // Task updates
      socket.on('task_update', (data) => {
        const { projectId, taskId, status } = data;
        
        this.io.to(`project:${projectId}`).emit('task_status_changed', {
          taskId,
          status,
          userId: socket.user.id
        });
      });

      socket.on('disconnect', () => {
        console.log('User disconnected:', socket.user.username);
        
        // Clean up from all rooms
        for (const [projectId, sockets] of this.rooms.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            
            this.io.to(`project:${projectId}`).emit('user_left', {
              userId: socket.user.id,
              username: socket.user.username
            });
          }
        }

        this.users.delete(socket.id);
      });
    });
  }

  broadcastToProject(projectId, event, data) {
    this.io.to(`project:${projectId}`).emit(event, data);
  }

  getProjectUsers(projectId) {
    if (!this.rooms.has(projectId)) {
      return [];
    }
    
    return Array.from(this.rooms.get(projectId))
      .map(id => this.users.get(id))
      .filter(Boolean);
  }
}

module.exports = CollaborationService;
