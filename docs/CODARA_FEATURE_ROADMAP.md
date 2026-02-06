# Codara Feature Roadmap

This document tracks the phased delivery plan for Codara’s end-to-end, AI-native development platform. It covers repository hosting, collaboration, analytics, AI systems, CI/CD, infrastructure, and the self-training AI loop with strict resource caps.

## Phase 1: Core Git & Repository Experience
- Bare repository hosting with forks, templates, archive/pin, transfers, size analytics, and fork trees.
- Large file support and monorepo tooling.
- Rich commit pages with inline discussion, reactions, verification, tagging (security/performance/refactor/hotfix), and impact analysis.
- Branch management with protection rules, auto-delete merged branches, merge queues, auto-rebase, conflict visualization, multi-branch comparison, branch health scoring, and lifespan tracking.
- Activity heatmaps and repository pinning.

## Phase 2: Collaboration & Social Layer
- Developer profiles, follow system, presence indicators, status messages, repo watchers.
- Teams/org pages, contribution streaks, skill badges, reputation scores, and leaderboards.
- Inline discussions on commits and code, reactions, and granular notification controls.

## Phase 3: Search & Discovery
- Full-text and symbol search, semantic search (e.g., “find auth logic”), cross-repo search, dependency search, error/stack trace search, contributor search.
- Explore/trending pages with real-time filters and debounced results.

## Phase 4: Analytics & Intelligence
- Repo health scores, bus factor detection, churn metrics, complexity heatmaps, tech debt tracking.
- Review-time stats, release frequency charts, file ownership detection, hotspot and abandoned-project detection.
- Commit impact analysis and predictive signals for risky PRs, future bugs, performance or scaling issues.

## Phase 5: AI Layer & Developer Assistance
- AI code review, bug detection, refactor suggestions, security scanning, test and documentation generation, README/PR summaries, architecture explanations, commit message generation.
- Runtime-to-source mapping connecting live CPU/memory/log data to source lines.
- Architecture auto-detection with generated system diagrams, dependency maps, and data-flow graphs.
- Parallel-universe branching to simulate alternate futures (e.g., module rewrites or scaling scenarios).

## Phase 6: Self-Training AI System (Resource-Limited)
- Continuous low-priority training capped at 2 GB GPU VRAM (or 2 GB system RAM when no GPU).
- Pauses under high load; resumes incrementally using commits, PRs, discussions, refactors, bugs, and tests.
- Model storage/versioning at `Z:/models/codara/` with subfolders: `base/`, `global/`, `repo-specific/`, `org-specific/`, `checkpoints/`, `versions/`.
- Background scheduler to ensure nightly/idle-time training and checkpoint retention policies.

## Phase 7: Developer Platform & CI/CD
- Lightweight CI/CD with shell/Docker runners, PR status checks, merge queues, and artifact collection.
- Job/workflow storage under `Z:/mnt/runners/jobs/{job_id}/`; live log streaming via WebSocket.
- Browser-based dev environments with persistent containers and live terminals; web editor/VSCode integration.
- Plugin/extension system, public API, webhooks, and package registries (npm, Docker, Python).

## Phase 8: Infrastructure & Security
- Redis caching, Postgres metadata, object/blob storage, repo sharding, worker clusters, background queues.
- Advanced security: secret leak detection, dependency vulnerability scanning, token misuse detection, suspicious commit detection, audit logs.
- Architecture for high-availability cluster discovery, load balancing, failover, and shared storage (`Z:/mnt/`).

## Phase 9: Knowledge Graph & Evolution Tools
- Global knowledge graph across repos to map shared patterns and reused logic.
- Time-travel repository viewer to replay history like a video.
- Code evolution graph to track function ancestry over time.

## Delivery Notes
- Each phase should ship in small, incremental slices with feature flags.
- Instrumentation and telemetry must respect privacy and resource limits.
- Security scanning and secret detection run by default on pushes and PRs.
- Training tasks must always respect the 2 GB VRAM/RAM cap and run at low priority.
