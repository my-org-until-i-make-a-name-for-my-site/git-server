const fs = require('fs-extra');
const path = require('path');

class SearchIndexer {
  constructor(db, options = {}) {
    this.db = db;
    this.intervalMs = options.intervalMs || 5 * 60 * 1000; // default 5 minutes
    this.maxFilesPerRepo = options.maxFilesPerRepo || 200;
    this.maxFileBytes = options.maxFileBytes || 64 * 1024; // 64KB cap per file
    this.minQueryLength = options.minQueryLength || 2;
    this.index = [];
    this.timer = null;
    this.ready = false;
  }

  async start() {
    await this.buildIndex();
    this.timer = setInterval(() => {
      this.buildIndex().catch((err) => console.error('Periodic search index rebuild failed:', err));
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Load all repositories from the database, index a subset of their file contents,
   * and refresh the in-memory search index.
   */
  async buildIndex() {
    const repos = await this._loadRepos();
    const newIndex = [];

    for (const repo of repos) {
      const entry = await this._indexRepo(repo);
      if (entry) {
        newIndex.push(entry);
      }
    }

    this.index = newIndex;
    this.ready = true;
    return newIndex;
  }

  search(query) {
    if (!query || query.length < this.minQueryLength) return [];
    const term = query.toLowerCase();
    return this.index
      .filter((entry) =>
        entry.text.includes(term)
      )
      .map(({ repo }) => repo);
  }

  async _loadRepos() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT id, name, description, path FROM repositories', (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  async _indexRepo(repo) {
    if (!repo?.path) return null;
    const repoPath = repo.path;

    if (!(await fs.pathExists(repoPath))) {
      return null;
    }

    const texts = [repo.name || '', repo.description || ''];
    let filesIndexed = 0;

    const stack = [''];
    while (stack.length && filesIndexed < this.maxFilesPerRepo) {
      const rel = stack.pop();
      const abs = path.join(repoPath, rel);
      let stat;
      try {
        stat = await fs.stat(abs);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        let children = [];
        try {
          children = await fs.readdir(abs);
        } catch {
          continue;
        }
        for (const child of children) {
          stack.push(path.join(rel, child));
        }
      } else if (stat.isFile()) {
        filesIndexed++;
        texts.push(rel.toLowerCase());
        try {
          const snippet = await this._readFileSlice(abs);
          if (snippet) {
            texts.push(snippet.toLowerCase());
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    return {
      repo: {
        id: repo.id,
        name: repo.name,
        description: repo.description,
        path: repo.path
      },
      text: texts.join('\n')
    };
}

  async _readFileSlice(filePath) {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(this.maxFileBytes);
      const { bytesRead } = await handle.read(buffer, 0, this.maxFileBytes, 0);
      return buffer.slice(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  }
}

module.exports = SearchIndexer;
