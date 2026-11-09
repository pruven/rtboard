# rtboard

A private visual workspace inspired by [crboard's](https://github.com/newomp4/crboard) idea of collecting things on an endless canvas. Independently implemented with React, TypeScript, and Vite; no source or assets were copied from the reference.

## Run

```sh
npm install
npm run dev
```

Open the URL Vite prints. `npm run build` produces a static site in `dist/`; `npm run preview` serves the production build. Deploy `dist/` to any static host.

## Collect and arrange

- Multiple named boards, with browser autosave and duplication.
- Drag and resize notes, text, images, bookmarks, and drawings.
- Double-click text to edit; use the selected card's controls for colors, duplication, and deletion.
- Paste text, images, and URLs directly; drag in images or use the upload control. PNG, JPG, GIF, and WebP files up to 3 MB are supported.
- Play YouTube, Vimeo, and Spotify links inline. Other websites remain bookmarks. Embedded services require an internet connection and may apply their own privacy policies and playback restrictions.
- Draw with the pen and connect two cards with a curved line. Double-click a connection to remove it.
- Pan by dragging blank canvas or scrolling. Ctrl/Cmd + scroll zooms around the pointer. Zoom and fit controls also work on touch devices.
- Search the current board, undo/redo changes, and switch between light and dark themes.
- Export an editable `.rtboard` backup and import it from the options menu.
- Export a standalone HTML viewer with packaged images, playable supported links, connections, scrolling, and Ctrl/Cmd + scroll zoom. HTML is a viewing format; import `.rtboard` files to resume editing.

The help button lists keyboard shortcuts. Use Export board or Ctrl/Cmd + S to keep a backup. Local storage is tied to this browser and site origin and has limited capacity; clearing browser data deletes local boards. The app reports storage failures. There is no backend, account system, cloud sync, or collaboration.

## Checks

```sh
npm test
npm run build
```

Tests cover file validation, unsafe URL rejection, embed providers, safe HTML export, board creation, editing, history, local persistence, and search. Fonts and three starter photographs are served locally. Photographs are from Unsplash; fonts are DM Sans, DM Serif Display, and Kalam from Google Fonts.
