# Codara Feature Backlog & Self-Training AI Plan

This document captures the requested mega-list of future capabilities for Codara and a TODO tracker. These items are **not implemented** yet; they are queued work to plan and execute gradually.

## 🧱 Core Repository Platform

- Repository system: templates, forking with visual fork tree, private/public/internal repos, transfer between users/orgs, archiving, pinning to profile, monorepo tools, large file storage support, repo size analytics, repo activity heatmap, repo duplication detector.
- Branching & merging: branch protection rules, merge queue system, auto-rebase option, conflict visualizer UI, multi-branch comparison, branch lifespan tracking, branch health score, auto-delete merged branches.
- Commits: rich commit pages, commit reactions, inline commit discussion, verified commit system, commit tagging (security/performance/refactor/hotfix), commit impact analysis (files affected, potential systems impacted).

## 👥 Social + Community Layer

- Follow developers, activity feed, stars/reactions/bookmarks, developer profiles, team/org pages, contribution streaks, skill badges, reputation score, top contributors leaderboard, “currently editing” presence, repo watchers, dev status messages.

## 🔍 Search System (Critical)

- Full code search, symbol search, function/class search, semantic search (e.g., “find auth logic”, “find database code”), cross-repo search, error message search, stack trace search, dependency search, search by contributor.

## 📊 Analytics + Intelligence

- Repo health score, bus factor detection, code churn metrics, complexity heatmaps, tech debt tracking, PR review time stats, release frequency charts, file ownership detection, hotspot detection (files that break often), silent repo detection (dead projects).

## 🧠 AI Layer

- AI PR reviews, AI bug detection, AI refactor suggestions, AI security scanning, AI test generation, AI documentation/README writer, AI commit message writer, AI PR summary, AI architecture explanation.

## 🧠 Self-Training AI System (Unique Differentiator)

- Behavior: slow background learning, low-priority, nightly, pauses under high server load.
- Resource caps: ~2 GB VRAM if GPU is available; fallback to ~2 GB system RAM on CPU-only hosts.
- Training sources: commits, PR discussions, code patterns, refactors, bug fixes, issue reports, test cases.
- Model storage layout: `Z:/models/codara/` with `base/`, `repo-specific/`, `org-specific/`, `global/`, `versions/`, and checkpoints in `Z:/models/codara/checkpoints/`.
- Model types: global (general coding patterns), repo-specific (architecture/style), org-specific (team habits), security (vulnerability patterns).
- Learns over time: coding styles, bug patterns, architecture patterns, naming conventions, refactor patterns, performance fixes.
- Improves: code suggestions, review accuracy, bug detection, PR summaries, architecture understanding.

## 🧬 Experimental / Novel Ideas

- Time-travel code viewer (replay history like video; jump to when a bug appeared).
- Code evolution graph and function ancestry tree (“code DNA”).
- Runtime mapping (link runtime metrics—memory, CPU hotspots, slow functions—to code lines).
- Repo memory brain (record why decisions were made, past problems/fixes).
- Self-maintaining repos (AI suggests cleanup, removes dead code, updates dependencies, improves structure).
- Parallel universe branches (simulate rewrites, module removals, scaling to millions of users).

## 🛠 Dev Platform Features

- CI/CD: lightweight pipelines, shell runners, docker runners, PR checks, test status UI.
- Dev environments: browser IDE, one-click workspaces, persistent containers, live terminal.

## 🌐 Infrastructure Ideas

- Redis caching layer, Postgres metadata layer, git blob storage layer, object storage support, repo sharding, worker node cluster, background job queue.

## 🔐 Security Features

- Secret leak detection, dependency vulnerability scanning, token misuse detection, suspicious commit detection, permission audit logs.

## 🧩 Ecosystem Features

- Plugin system, extension marketplace, public API, webhooks, package registry (npm, Docker, Python).

## 🚀 Extreme Long-Term Ideas

- P2P repo hosting, distributed cloning network, edge caching repos globally, AI that suggests features to build next, AI that writes entire starter repos, cross-repo knowledge graph.

## 🎯 Most Unique Combo (Revolutionary Set)

1. Self-training local AI models  
2. Repo memory system  
3. Time-travel code viewer  
4. Architecture auto-mapping  
5. Self-maintaining repos  

Together, these aim to make Codara a “living, learning development platform.”

## ❓ Strategic Direction Prompt

Choose one to guide phased delivery:
- A) AI-first platform
- B) Performance-first Git host
- C) Self-hosted enterprise tool
- D) Experimental research platform
- E) “GitHub but smarter”

## ✅ TODO (Do Not Implement Yet)

 - [x] Confirm strategic direction (A–E) to prioritize sequencing — selected **A) AI-first platform** to emphasize AI-driven capabilities.
- [ ] Define minimal viable scope for self-training AI (2 GB cap, nightly, checkpoints).
- [ ] Draft data governance and safety constraints for background training.
- [ ] Design storage layout and retention for `Z:/models/codara/**` and checkpoints.
- [ ] Prototype semantic search stack covering code/symbol/function/class.
- [ ] Map analytics metrics (health score, churn, hotspots) to existing data sources.
- [ ] Outline UX for time-travel viewer and code evolution graph.
- [ ] Plan repo memory brain data model and retrieval APIs.
- [ ] Specify CI/CD runner matrix (shell/docker) and quota limits.
- [ ] Define plugin/extension API surface and marketplace publish flow.
- [ ] Security roadmap: secrets, dependency scanning, token misuse, audit logs.

These items are deliberately listed for future implementation; no functionality has been added in this PR.
