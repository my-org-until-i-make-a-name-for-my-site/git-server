const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');

class WorkflowParser {
    constructor() {
        this.moduleCache = new Map();
    }

    /**
     * Parse a workflow file
     */
    async parseWorkflow(workflowPath) {
        const content = await fs.readFile(workflowPath, 'utf8');
        const workflow = yaml.load(content);

        if (!workflow.name) {
            throw new Error('Workflow must have a name');
        }

        return {
            name: workflow.name,
            on: workflow.on || {},
            env: workflow.env || {},
            jobs: workflow.jobs || {},
            rawPath: workflowPath
        };
    }

    /**
     * Resolve a workflow module (uses: syntax)
     * Supports:
     * - uses: github/actions/checkout@v3
     * - uses: codara/username/module@v1
     * - uses: orgname/reponame/path/to/action@v1
     */
    async resolveModule(usesString, context) {
        // Parse uses string
        const match = usesString.match(/^([^\/]+)\/([^\/]+)\/([^@]+)(?:@(.+))?$/);

        if (!match) {
            throw new Error(`Invalid uses syntax: ${usesString}`);
        }

        const [, source, ownerOrAction, pathOrVersion, version] = match;

        // Handle GitHub actions
        if (source === 'github') {
            return this.resolveGitHubAction(ownerOrAction, pathOrVersion, version);
        }

        // Handle Codara modules (local or from other repos)
        if (source === 'codara') {
            return this.resolveCodaraModule(ownerOrAction, pathOrVersion, version, context);
        }

        // Handle org/repo/path format
        return this.resolveCodaraModule(source, `${ownerOrAction}/${pathOrVersion}`, version, context);
    }

    /**
     * Resolve GitHub action (simulated - maps to equivalent shell commands)
     */
    async resolveGitHubAction(action, subpath, version) {
        // Map common GitHub actions to equivalent commands
        const actionMap = {
            'actions/checkout': {
                name: 'Checkout',
                run: 'git fetch && git checkout ${GITHUB_REF}'
            },
            'actions/setup-node': {
                name: 'Setup Node.js',
                run: 'node --version'
            },
            'actions/setup-python': {
                name: 'Setup Python',
                run: 'python --version'
            },
            'actions/cache': {
                name: 'Cache',
                run: 'echo "Caching not implemented"'
            }
        };

        const actionKey = `${action}/${subpath}`;

        if (actionMap[actionKey]) {
            return actionMap[actionKey];
        }

        // Default fallback
        return {
            name: `GitHub Action: ${actionKey}`,
            run: `echo "Simulating GitHub action: ${actionKey}@${version}"`
        };
    }

    /**
     * Resolve Codara module from a repository
     */
    async resolveCodaraModule(owner, modulePath, version, context) {
        // Check if module is cached
        const cacheKey = `${owner}/${modulePath}@${version}`;

        if (this.moduleCache.has(cacheKey)) {
            return this.moduleCache.get(cacheKey);
        }

        // For now, assume modules are in .codara/modules/{owner}/{modulePath}
        // In production, this would fetch from the repo
        const localModulePath = path.join(
            context.repoPath || '.',
            '.codara',
            'modules',
            owner,
            modulePath
        );

        try {
            const moduleFile = path.join(localModulePath, 'action.yml');

            if (await fs.pathExists(moduleFile)) {
                const moduleContent = await fs.readFile(moduleFile, 'utf8');
                const module = yaml.load(moduleContent);

                this.moduleCache.set(cacheKey, module);
                return module;
            }
        } catch (error) {
            console.error(`Failed to load module ${cacheKey}:`, error);
        }

        // Fallback to inline command
        return {
            name: `Module: ${owner}/${modulePath}`,
            run: `echo "Module ${cacheKey} not found or not implemented"`
        };
    }

    /**
     * Expand a job's steps, resolving all 'uses' directives
     */
    async expandJobSteps(job, context) {
        const expandedSteps = [];

        for (const step of job.steps || []) {
            if (step.uses) {
                // Resolve the module
                const module = await this.resolveModule(step.uses, context);

                expandedSteps.push({
                    name: step.name || module.name,
                    run: module.run,
                    env: { ...module.env, ...step.env },
                    with: step.with
                });
            } else {
                expandedSteps.push(step);
            }
        }

        return expandedSteps;
    }

    /**
     * Check if workflow should run for given event
     */
    shouldRunForEvent(workflow, eventType, eventData) {
        const on = workflow.on;

        if (!on) return false;

        // Simple string event
        if (typeof on === 'string') {
            return on === eventType;
        }

        // Array of events
        if (Array.isArray(on)) {
            return on.includes(eventType);
        }

        // Object with event configuration
        if (typeof on === 'object') {
            if (on[eventType]) {
                const eventConfig = on[eventType];

                // Simple boolean
                if (eventConfig === true) return true;

                // Branch filtering for push/pull_request
                if (eventConfig.branches) {
                    const branches = Array.isArray(eventConfig.branches)
                        ? eventConfig.branches
                        : [eventConfig.branches];

                    return branches.some(pattern => {
                        if (pattern === eventData.branch) return true;
                        if (pattern.includes('*')) {
                            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                            return regex.test(eventData.branch);
                        }
                        return false;
                    });
                }

                return true;
            }
        }

        return false;
    }
}

module.exports = WorkflowParser;
