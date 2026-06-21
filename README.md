<div align="center">
  <img src="resources/icon.png" width="120" alt="Loupe" />
  <h1>Loupe</h1>
  <p><strong>Review code inline in your real files — diff in the gutter, comments in the margin — then hand your notes to Claude.</strong></p>
  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=jonahseguin.loupe"><img src="https://img.shields.io/visual-studio-marketplace/v/jonahseguin.loupe?label=VS%20Code%20Marketplace&color=4F46E5" alt="VS Code Marketplace" /></a>
    <a href="https://open-vsx.org/extension/jonahseguin/loupe"><img src="https://img.shields.io/open-vsx/v/jonahseguin/loupe?label=Open%20VSX&color=4F46E5" alt="Open VSX" /></a>
  </p>
</div>

A VS Code / Cursor extension for reviewing changes *in place*. Instead of bouncing to GitHub's web UI or a separate diff tab, Loupe overlays the diff onto the files you're already editing (with full language-server context), lets you leave inline comments anywhere, and exports those comments as clean markdown for Claude Code — or for your own notes.

## Why

Reviewing on github.com is slow and collapses the surrounding context. The official PR extension is better but forces every file into a dedicated diff tab. Loupe takes a different stance:

- **Comments are always on.** You don't need a PR or "review mode" to annotate code.
- **Review mode is just the diff.** Toggle it to paint change-bars over your real editors and list the changed files.
- **Reviewing your own / an agent's work is a first-class flow** — leave notes, then copy them straight back to Claude.

## Features

- **Inline comments, anywhere.** Gutter `+` on any file, right-click → *Add Comment*, or `Cmd/Ctrl+Alt+M`. Select multiple lines to comment on a range. Comments persist across reloads.
- **Diff overlay (review mode).** `Cmd/Ctrl+Alt+R` toggles it. Choose **Whole branch vs main** (review committed branch work — great for agent commits) or **Uncommitted changes**. Change-bars render in your real editors; changed files show in the sidebar.
- **Copy for Claude.** `Cmd/Ctrl+Alt+C` (or the status-bar item / sidebar button) copies every comment as markdown — file path, line range, code snippet, and your note — ready to paste into Claude Code.
- **Comments & Changes sidebar** with per-file comment counts, plus **Clear All Comments**.

## Commands & keybindings

| Command | Keybinding |
|---|---|
| Loupe: Toggle Review Mode (diff) | `Cmd/Ctrl+Alt+R` |
| Loupe: Add Comment (at cursor) | `Cmd/Ctrl+Alt+M` |
| Loupe: Copy Comments | `Cmd/Ctrl+Alt+C` |
| Loupe: Clear All Comments | — |

All keybindings are rebindable in **Keyboard Shortcuts** (search "loupe").

## Install

**From your editor** — open the Extensions view, search **Loupe**, and click Install:

- **VS Code** → [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jonahseguin.loupe)
- **Cursor / VSCodium** → [Open VSX](https://open-vsx.org/extension/jonahseguin/loupe)

**From the command line:**

```bash
code --install-extension jonahseguin.loupe     # VS Code
cursor --install-extension jonahseguin.loupe   # Cursor (resolves from Open VSX)
```

### From source

```bash
git clone git@github.com:jonahseguin/loupe.git
cd loupe
npm install
npm run package                            # builds loupe-<version>.vsix
cursor --install-extension loupe-*.vsix    # or: code --install-extension loupe-*.vsix
```

Then reload the editor. (During development you can also press `F5` to launch an Extension Development Host.)

## Development

```bash
npm test          # compile + run the test suite in a VS Code test host
npm run bundle    # esbuild production bundle -> dist/extension.js
npm run package   # produce the .vsix
node scripts/gen-icon.mjs   # regenerate resources/icon.png
```

Built with TypeScript and the VS Code extension API. Git access is via the `git` CLI (no native dependencies). The core is source-agnostic: a comment/session layer that's independent of the diff overlay, so future layers (GitHub PRs, worktree-isolated review) can plug into the same engine.

## License

[MIT](LICENSE) © Jonah Seguin
