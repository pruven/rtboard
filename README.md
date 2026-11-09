# rtboard

An independently implemented canvas app closely matching [crboard's](https://github.com/newomp4/crboard) minimal interface and core workflows. Uses React, TypeScript, Vite, and Bun. The reference was inspected visually and through its public interface; its source was not cloned or copied.

## Run

```sh
bun install
bun run dev
```

Open the URL Vite prints. `bun run build` produces `dist/` for any static host; `bun run preview` serves that production build.

## Canvas

- A board library, compact header, full-screen dotted canvas, six-tool bottom toolbar, and light/dark themes.
- Select (V) moves and selects elements. Hand (H) pans the canvas. Hold the middle mouse button and drag to temporarily pan from any tool; releasing restores that tool. Space + drag also temporarily pans.
- Text, freehand drawings, rectangles, ellipses, sticky notes, and arrow connectors. Draw shapes by dragging; double-click text or a note to edit it.
- Connectors offer Straight, Curved, and Elbow routes. Start and release near elements to snap to their edges; attached connectors follow elements as they move or resize. Select a connector to change its route or drag either endpoint to another element.
- Each snapped endpoint stays attached independently, even when the other end is free. Existing standalone connectors also have endpoint handles for attaching or detaching them.
- Choose One end, Both ends, or None for connector arrowheads. The setting applies to attached connectors and standalone connectors and is preserved in exports.
- Font size, bold, italic, alignment, fill colors, border colors, and stroke widths.
- Drag selection, Shift-click selection, group movement, duplication, layer order, resizing, arrow-key nudging, undo, and redo. Shift-resize preserves aspect ratio.
- Drag selected elements by their body or selection border. Drag the space between selected elements to move the group. Selected media can be dragged too; click Interact or double-click it to use playback controls, then grab its border to move it again.
- Paste links or text, or drag in media. Import lists of links from File. Image, video, and audio files up to 40 MB each are supported.
- Inline YouTube, Instagram, TikTok, X/Twitter, Vimeo, Spotify, Reddit, Loom, and CodePen embeds. Direct video/audio URLs use native media controls. Other URLs become bookmarks.
- Instagram cards initialize through Instagram's official embed script, including in HTML exports. Public reels can play inline when Instagram permits it; use the card's open link if a reel requires Instagram or sign-in.
- Search text, notes, titles, and media names with Ctrl/Cmd F.
- Right-click the canvas for insertion and selection actions. Double-click a tool to keep it active.

## Files and sharing

- File → Save as .rtboard creates a portable editable backup with attached media.
- File → Open imports `.rtboard`, JSON, or rtboard's exported HTML files. The `.crboard` format is not supported.
- Export shareable HTML packages media, drawings, shapes, connectors, and a standalone pan/zoom viewer. Supported embeds remain playable online. The same HTML file can be imported back into rtboard for editing.
- Copy share link embeds compressed board data in the URL fragment. Large boards should use HTML export instead; links are limited to 120,000 encoded characters.
- Export PNG renders the full board at up to 2× resolution, subject to canvas memory limits. Interactive embeds, video, and audio appear as labeled media tiles in the static PNG.
- Auto-backup writes a board file to a chosen directory immediately, then every ten minutes while the app remains open. This requires a browser with `showDirectoryPicker` support, and folder access must be selected again after reopening the app.

Boards are saved locally in IndexedDB, with a localStorage fallback. Existing localStorage boards are migrated on load. No account, backend, cloud sync, or collaboration is required. Clearing site data removes local boards; keep exported backups. Embedded providers receive requests when their frames load and may restrict playback, require sign-in, or block embedding.

## Shortcuts

| Action                                    | Shortcut                      |
| ----------------------------------------- | ----------------------------- |
| Select / Text / Draw / Connector / Shapes | V / T / P / C / S             |
| Hand                                      | H                             |
| Temporary Hand mode                       | Middle mouse + drag           |
| Sticky note                               | N                             |
| Pan from any tool                         | Space + drag                  |
| Select all                                | Ctrl/Cmd A                    |
| Undo / redo                               | Ctrl/Cmd Z / Shift Ctrl/Cmd Z |
| Duplicate                                 | Ctrl/Cmd D                    |
| Copy selection / paste                    | Ctrl/Cmd C / V                |
| Save board                                | Ctrl/Cmd S                    |
| Find                                      | Ctrl/Cmd F                    |
| Reset to 100% / fit content               | Ctrl/Cmd 0 / 1                |
| Nudge / nudge by ten                      | Arrows / Shift + arrows       |
| Delete                                    | Delete / Backspace            |
| Cancel                                    | Escape                        |
| Shortcuts dialog                          | ?                             |

Scroll to pan, Ctrl/Cmd + scroll or pinch to zoom. Zoom buttons are also available. Double-click a connector to remove it.

## Verification

```sh
bun run test
bun run build
```

Tests cover the board workflow, selection, group duplication, keyboard controls, shapes, locking, search, persistence, media URL handling, safe import/export, HTML round-trips, and compressed share links.

The interface uses a locally served Geist font under its included OFL license. Older starter photographs remain available locally to preserve previously saved boards; they are from Unsplash.
