# Loupe — Design

**A jeweler's loupe for your code.** Review changes inline in your *real* files — diff in the gutter, comments in the margin — then hand your notes to Claude or submit them to GitHub. A VSCode/Cursor extension.

- **Status:** Design approved; building Layer A (local / agent-code review) first.
- **Date:** 2026-06-19

---

## 1. Problem & Motivation

Reviewing code today is painful in two distinct ways:

1. **GitHub's web UI** is slow, laggy, and collapses surrounding context, making it hard to understand changes against the full file.
2. **The official "GitHub Pull Requests" extension** improves on this but forces every file into a *dedicated split diff tab*, separate from the files you actually work in. There's no way to just *toggle* review on top of the files you're already editing.

Neither tool addresses a third, increasingly common need: **self-reviewing AI/agent-generated code** (e.g. what Claude Code just wrote) and feeding structured feedback back to the agent.

Loupe's core idea: **overlay the diff onto your real, fully-LSP'd files, toggle review mode on/off, leave inline comments, and route those comments to wherever they need to go** — Claude Code or GitHub.

## 2. Goals & Non-Goals

### Goals
- Toggle a "review mode" that overlays a diff (gutter change bars + green/red) onto your **real editor files**, not a separate diff tab.
- Leave **inline comment threads** anchored to lines in those real files.
- **Layer A (MVP):** review local changes on your current branch and **export comments formatted for Claude Code** (path + line range + snippet + note). No GitHub, no auth.
- **Layer B:** a GitHub PR adapter — list open PRs for the repo, review them with the same overlay, and **submit a batched review** (Comment / Approve / Request changes).
- **Layer C:** review a *different* PR concurrently without disturbing active work (virtual read-only and/or worktree).
- Run as an **extension inside Cursor/VSCode** (not a fork, not a standalone app) so the user keeps their LSP, settings, theming, and agent for free.

### Non-Goals
- Not a VSCode fork or standalone application.
- Not reimplementing Cursor's private agent-diff API; we use only public VSCode APIs.
- Not solving comment-range drift perfectly in the MVP (minor drift accepted).
- No CI/status, PR creation, or merge actions in early layers.

## 3. Architecture — One Source-Agnostic Engine

Everything is **one engine** with two pluggable abstractions. Layers A/B/C are thin adapters, not separate apps.

### Core abstractions

```
DiffSource  — "where does the diff come from?"
  perFile() -> { baseContent, headContent | realFileUri }
  changedFiles() -> [{ path, status: A|M|D|R, binary? }]

CommentSink — "where do the comments go?"
  submit(threads) -> void
```

**`DiffSource` implementations:**
- `LocalDiffSource` (Layer A): base = a git ref (`HEAD` for uncommitted-only, or `merge-base(HEAD, main)` for whole-branch); head = the **real working file on disk**.
- `GitHubPRDiffSource` (Layer B): base = PR base branch; head = checked-out branch, or a **virtual git-ref document** (Layer C).

**`CommentSink` implementations:**
- `ClaudeExportSink` (Layer A): format threads → markdown → clipboard (and optionally `.review/comments.md`).
- `GitHubReviewSink` (Layer B): batch threads → GitHub review via the GitHub API / `gh` CLI.

### Shared machinery (built once)
- **Diff overlay** — a `QuickDiffProvider` serves each changed file's base content, so VSCode paints **gutter change bars + inline change-peek directly in the real editors**. Optional `TextEditorDecorationType` for stronger green/red full-line backgrounds.
- **Inline comments** — a single `CommentController`; threads anchored to a file URI + line range; works in normal editors, not just diff tabs.
- **Toggle** — `loupe.toggle` command flips a `loupe.active` context key. On → register quick-diff + decorations + show threads. Off → dispose; plain files return.
- **Session** — `ReviewSession` holds the active base ref, changed-file set, and comment threads; persisted to `workspaceState` so it survives reload / toggle.
- **UI** — a "Loupe" sidebar (TreeView): changed files + per-file comment counts. Layer B adds a "Pull Requests" section to the same sidebar. Plus a status-bar item showing mode + comment count.

**Key property:** Layer A and Layer B are the same engine with different `DiffSource` + `CommentSink` pairs. The overlay/comment/toggle machinery is written once.

### The checkout / isolation spectrum (informs Layer C, anticipated by the engine)
- **Review in place** (Layer A): you're already on the branch; real files on disk; **full LSP / go-to-def**. No caveat.
- **Virtual read-only** (Layer C option 1): pull any file at any ref via `git show <ref>:<path>`, render as a read-only virtual document, diff + comment on it. Zero workspace disturbance, no deps install needed; trade-off is **degraded go-to-def into dependencies** (the doc isn't part of the project).
- **Worktree** (Layer C option 2): full checkout in a separate dir for deep navigation/running; costs a one-time deps install. (Symlinking `node_modules` is explicitly rejected as fragile.)

Because `DiffSource.head` can be *either* a real file URI *or* a virtual git-ref document, the engine already anticipates all three points on this spectrum.

## 4. Layer A — Local / Agent-Code Review (MVP)

### Data flow
1. User is on their branch (with uncommitted edits and/or commits ahead of base).
2. `loupe.toggle` → quick-pick the **base ref**:
   - **Uncommitted changes** → base = `HEAD` (the "Claude just edited files" case).
   - **Whole branch vs main** → base = `merge-base(HEAD, <defaultBranch>)`.
   - **Pick a ref/commit…** → escape hatch.
   - Last choice remembered per workspace.
3. `git diff --name-status <baseRef>` → changed-file list → "Loupe" sidebar.
4. `QuickDiffProvider` serves base content per file via `git show <baseRef>:<path>` → gutter bars + green/red appear **in the real, fully-LSP'd editors**.
5. User adds comments via the gutter `+` in the real editor → threads stored in the session + `workspaceState`.
6. **Copy for Claude** → `ClaudeExportSink` formats all threads → clipboard.

### "Copy for Claude" format
```markdown
# Review comments (N)

## <relative/path>:<startLine>–<endLine>
```<lang>
<code snippet at that range>
```
> <the reviewer's note>

## <relative/path>:<line>
> <note with no snippet for single-line / file-level>
```
Path + line range + code snippet + note. One paste → Claude Code has full context to act.

### Error / edge handling
- Not a git repo → toggle disabled with a notice.
- No diff vs base → "nothing to review."
- Deleted files → listed; file-level comment only (no inline anchor).
- Binary / renamed files → listed; overlay skipped gracefully.
- Comment ranges may drift if the file is edited after commenting — MVP accepts minor drift (no live re-anchoring).

## 5. Layer B — GitHub PR Review (future)
- `GitHubPRDiffSource` + `GitHubReviewSink`.
- "Pull Requests" section in the Loupe sidebar: lists open PRs for the repo's `origin`, highlights the PR for the current branch, optional branch/worktree switch.
- Same overlay + inline-comment experience on the real (or virtual) files.
- "Submit Review" batches pending comments into a GitHub review: Comment / Approve / Request changes.
- Auth via the built-in GitHub session API or `gh` CLI.

## 6. Layer C — Concurrent Review (future)
- Review a different PR while active work continues, via the **virtual read-only** path (no workspace disturbance) or a **worktree window** (deep navigation). See §3 spectrum.

## 7. Tech Stack & Testing
- **Language:** TypeScript, VSCode Extension API. Runs in Cursor (install via VSIX if not on Open VSX).
- **Git access:** repo/branch discovery via the built-in Git extension API; content via `git show` / `git diff` over the CLI (no native deps).
- **Build:** esbuild bundle; `vsce` / `ovsx` for packaging.
- **Testing (TDD):**
  - Unit: `git diff --name-status` parsing, base-content retrieval, the Claude-export formatter — the pure-ish logic.
  - Integration: `QuickDiffProvider` + `CommentController` registration and toggle behavior via the VSCode extension test harness.

## 8. Build Order
1. **Core engine + Layer A** (this plan): `DiffSource`/`CommentSink` abstractions, quick-diff overlay, comment controller, toggle, session persistence, `LocalDiffSource`, `ClaudeExportSink`, sidebar + status bar.
2. **Layer B**: GitHub adapters + PR list + submit.
3. **Layer C**: virtual read-only + worktree concurrency.
