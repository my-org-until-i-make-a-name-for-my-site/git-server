# VSCode Web Editor Integration

This document explains how to integrate VSCode Web editor for code editing in repositories.

## Fork Microsoft/vscode and Build Custom Editor

### 1. Fork and Clone VSCode

```bash
git clone https://github.com/microsoft/vscode.git codara-editor
cd codara-editor
```

### 2. Remove Terminal (Disable Terminal Feature)

Edit `src/vs/workbench/contrib/terminal/browser/terminal.contribution.ts` and comment out terminal registration.

### 3. Build for Web

```bash
yarn
yarn compile-web
yarn gulp vscode-web-min
```

### 4. Integrate with Codara

Serve the built VSCode from `out-vscode-web-min/`:

```javascript
app.use('/vscode', express.static(path.join(__dirname, '../codara-editor/out-vscode-web-min')));
```

## API Endpoints

- `POST /api/:owner/:repo/editor/start` - Start editor
- `POST /api/:owner/:repo/editor/stop` - Stop editor  
- `GET /api/:owner/:repo/editor/status` - Check status
