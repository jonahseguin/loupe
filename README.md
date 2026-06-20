# Loupe

Review changes inline in your real files — diff in the gutter, comments in the margin — then hand your notes to Claude.

## What it does

- **Inline comments, always on.** Hover the gutter `+` on any file (or right-click → *Add Comment*, or `Cmd/Ctrl+Alt+M`) to leave a review comment. Select multiple lines first to comment on a range. Comments persist across reloads.
- **Review mode (the diff).** Toggle with `Cmd/Ctrl+Alt+R` (or *Loupe: Toggle Review Mode*). Pick **Whole branch vs main** (review committed branch work) or **Uncommitted changes**, and Loupe paints diff change-bars in your real editors plus a changed-file list in the sidebar.
- **Copy for Claude.** `Cmd/Ctrl+Alt+C` (or the status-bar item / sidebar button) copies all your comments as markdown — file path, line range, code snippet, and note — ready to paste into Claude Code.
- **Clear all comments** and a comments/changes sidebar with per-file counts.

## Commands

| Command | Default keybinding |
|---|---|
| Loupe: Toggle Review Mode | `Cmd/Ctrl+Alt+R` |
| Loupe: Add Comment (at cursor) | `Cmd/Ctrl+Alt+M` |
| Loupe: Copy Comments | `Cmd/Ctrl+Alt+C` |
| Loupe: Clear All Comments | — |

Keybindings are rebindable in **Keyboard Shortcuts** (search "loupe").
