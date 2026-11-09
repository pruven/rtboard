import { instagramPermalink } from "./instagram";

export type Kind =
  "note" | "text" | "image" | "link" | "drawing" | "shape" | "video" | "audio";
export type Point = { x: number; y: number };
export type ConnectorRoute = "straight" | "curved" | "elbow";
export type ConnectorArrowheads = "one" | "both" | "none";
export const connectorArrowheads = (value: unknown): ConnectorArrowheads =>
  value === "both" || value === "none" ? value : "one";
export function connectorMarkers(value: unknown) {
  const mode = connectorArrowheads(value);
  return {
    markerStart: mode === "both" ? "url(#arrow)" : undefined,
    markerEnd: mode !== "none" ? "url(#arrow)" : undefined,
  };
}
export const connectorRoute = (value: unknown): ConnectorRoute =>
  value === "curved" || value === "elbow" ? value : "straight";
export type Item = {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color?: string;
  src?: string;
  points?: number[][];
  shape?: "rectangle" | "ellipse";
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  arrow?: boolean;
  route?: ConnectorRoute;
  arrowheads?: ConnectorArrowheads;
};
export type Connection = { id: string; from: string; to: string; route?: ConnectorRoute; arrowheads?: ConnectorArrowheads };
export type Board = {
  id: string;
  name: string;
  items: Item[];
  connections: Connection[];
  updated: number;
};
export type Workspace = { boards: Board[]; active: string };
export const uid = () => crypto.randomUUID();
export const colors = [
  "#ffe58a",
  "#a5d8ff",
  "#b2f2bb",
  "#ffc9c9",
  "#d0bfff",
  "#e9ecef",
];
export const strokes = ["#0a0a0a", "#4c7ef3", "#e5484d", "#ffffff"];
export const createBoard = (name = "Untitled board"): Board => ({
  id: uid(),
  name,
  items: [],
  connections: [],
  updated: Date.now(),
});
export const initialWorkspace = (): Workspace => ({ boards: [], active: "" });
export function safeUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function embedUrl(value: string): string | null {
  const valueUrl = safeUrl(value);
  if (!valueUrl) return null;
  const u = new URL(valueUrl),
    host = u.hostname.replace(/^www\./, "");
  let id: string | undefined;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  if (["youtube.com", "m.youtube.com"].includes(host))
    id =
      u.searchParams.get("v") ||
      u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
  if (id && /^[\w-]+$/.test(id))
    return `https://www.youtube-nocookie.com/embed/${id}`;
  if (host === "vimeo.com" && /^\/\d+/.test(u.pathname))
    return `https://player.vimeo.com/video/${u.pathname.split("/")[1]}`;
  if (
    host === "open.spotify.com" &&
    /^\/(track|album|playlist|episode|show)\/[\w]+/.test(u.pathname)
  )
    return `https://open.spotify.com/embed${u.pathname}`;
  const instagram = instagramPermalink(valueUrl);
  if (instagram) return `${instagram}embed/`;
  if (host === "tiktok.com") {
    const m = u.pathname.match(/\/video\/(\d+)/);
    if (m) return `https://www.tiktok.com/player/v1/${m[1]}`;
  }
  if (["x.com", "twitter.com"].includes(host)) {
    const m = u.pathname.match(/\/status\/(\d+)/);
    if (m)
      return `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&theme=dark`;
  }
  if (host === "reddit.com" && /\/comments\//.test(u.pathname))
    return `https://www.redditmedia.com${u.pathname}?ref_source=embed&ref=share&embed=true`;
  if (host === "loom.com") {
    const m = u.pathname.match(/^\/(?:share|embed)\/([\w-]+)/);
    if (m) return `https://www.loom.com/embed/${m[1]}`;
  }
  if (host === "codepen.io") {
    const m = u.pathname.match(/^\/([\w-]+)\/(?:pen|full|embed)\/([\w-]+)/);
    if (m) return `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`;
  }
  return null;
}
export function linkItem(src: string, at: Point): Item {
  const url = safeUrl(src);
  if (!url) throw new Error("Enter a valid http:// or https:// link.");
  const host = new URL(url).hostname;
  const portrait = /instagram|tiktok/.test(host);
  const spotify = host === "open.spotify.com";
  const kind: Kind = /\.(mp4|webm|mov)(?:\?|$)/i.test(url)
    ? "video"
    : /\.(mp3|wav|ogg|m4a)(?:\?|$)/i.test(url)
      ? "audio"
      : "link";
  return {
    id: uid(),
    kind,
    ...at,
    w: portrait ? 330 : spotify ? 380 : 480,
    h:
      kind === "audio"
        ? 90
        : portrait
          ? 520
          : spotify
            ? 232
            : embedUrl(url)
              ? 305
              : 130,
    text: host.replace(/^www\./, ""),
    src: url,
  };
}
const colorSafe = (c: unknown) =>
  typeof c === "string" && /^(#[\da-fA-F]{3,8}|transparent)$/.test(c)
    ? c
    : undefined;
export function validateBoard(input: unknown): Board {
  const b = input as Board;
  if (
    !b ||
    typeof b.name !== "string" ||
    !Array.isArray(b.items) ||
    b.items.length > 2000
  )
    throw new Error("This file is not an rtboard board.");
  const ids = new Set<string>();
  const items = b.items.map((i): Item => {
    if (
      !i ||
      ![
        "note",
        "text",
        "image",
        "link",
        "drawing",
        "shape",
        "video",
        "audio",
      ].includes(i.kind) ||
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      typeof i.text !== "string" ||
      ![i.x, i.y, i.w, i.h].every(Number.isFinite) ||
      i.w < 1 ||
      i.h < 1 ||
      i.w > 20000 ||
      i.h > 20000
    )
      throw new Error("Invalid board item.");
    ids.add(i.id);
    if (
      i.src &&
      (typeof i.src !== "string" ||
        !(
          safeUrl(i.src) ||
          (["image", "video", "audio"].includes(i.kind) &&
            /^data:(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp3|wav|ogg|x-m4a|mp4));base64,/.test(
              i.src,
            )) ||
          /^\/images\/[a-z]+\.jpg$/.test(i.src)
        ))
    )
      throw new Error("Unsupported media URL.");
    if (
      (i.kind === "drawing" && !Array.isArray(i.points)) ||
      (i.points &&
        (!Array.isArray(i.points) ||
          i.points.length > 100000 ||
          i.points.some(
            (p) =>
              !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite),
          )))
    )
      throw new Error("Invalid drawing data.");
    return {
      id: i.id,
      kind: i.kind,
      x: i.x,
      y: i.y,
      w: i.w,
      h: i.h,
      text: i.text,
      src: i.src,
      color: colorSafe(i.color),
      stroke: colorSafe(i.stroke),
      strokeWidth: [1, 2, 3, 4, 6, 8, 12].includes(i.strokeWidth || 0)
        ? i.strokeWidth
        : 2,
      points: i.points,
      shape: i.shape === "ellipse" ? "ellipse" : "rectangle",
      fontSize: Math.min(160, Math.max(10, i.fontSize || 20)),
      bold: !!i.bold,
      italic: !!i.italic,
      align: ["left", "center", "right"].includes(i.align || "")
        ? i.align
        : "left",
      arrow: !!i.arrow,
      route: connectorRoute(i.route),
      arrowheads: connectorArrowheads(i.arrowheads),
    };
  });
  const connections = (Array.isArray(b.connections) ? b.connections : [])
    .filter(
      (c) => c && typeof c.id === "string" && ids.has(c.from) && ids.has(c.to),
    )
    .map((c) => ({ id: c.id, from: c.from, to: c.to, route: connectorRoute(c.route), arrowheads: connectorArrowheads(c.arrowheads) }));
  return {
    id: uid(),
    name: b.name.slice(0, 120),
    items,
    connections,
    updated: Date.now(),
  };
}
export function parseBoardFile(text: string): Board {
  if (text.trimStart().startsWith("<")) {
    const doc = new DOMParser().parseFromString(text, "text/html"),
      data = doc.querySelector("#rtboard-data")?.textContent;
    if (!data)
      throw new Error(
        "This HTML file does not contain an editable rtboard board.",
      );
    const parsed = JSON.parse(data);
    return validateBoard(parsed.board || parsed);
  }
  return validateBoard(JSON.parse(text));
}
export function duplicateItems(
  board: Board,
  ids: string[],
): { board: Board; ids: string[] } {
  const map = new Map<string, string>();
  const copies = board.items
    .filter((i) => ids.includes(i.id))
    .map((i) => {
      const id = uid();
      map.set(i.id, id);
      return { ...i, id, x: i.x + 24, y: i.y + 24 };
    });
  return {
    board: {
      ...board,
      items: [...board.items, ...copies],
      connections: [
        ...board.connections,
        ...board.connections
          .filter((c) => map.has(c.from) && map.has(c.to))
          .map((c) => ({
            ...c,
            id: uid(),
            from: map.get(c.from)!,
            to: map.get(c.to)!,
          })),
      ],
    },
    ids: copies.map((i) => i.id),
  };
}
export function bounds(items: Item[]) {
  if (!items.length) return { x: 0, y: 0, w: 800, h: 600 };
  const x = Math.min(...items.map((i) => i.x)),
    y = Math.min(...items.map((i) => i.y));
  return {
    x,
    y,
    w: Math.max(...items.map((i) => i.x + i.w)) - x,
    h: Math.max(...items.map((i) => i.y + i.h)) - y,
  };
}
export function connectionPoints(
  a: Pick<Item, "x" | "y" | "w" | "h" | "shape">,
  b: Pick<Item, "x" | "y" | "w" | "h" | "shape">,
  route: ConnectorRoute = "straight",
) {
  const ax = a.x + a.w / 2,
    ay = a.y + a.h / 2,
    bx = b.x + b.w / 2,
    by = b.y + b.h / 2;
  const edge = (i: typeof a, dx: number, dy: number) => {
    const f =
      1 / Math.max(i.shape === "ellipse"
        ? Math.hypot(dx / (i.w / 2), dy / (i.h / 2))
        : Math.max(Math.abs(dx) / (i.w / 2), Math.abs(dy) / (i.h / 2)), 0.00001);
    return { x: i.x + i.w / 2 + dx * f, y: i.y + i.h / 2 + dy * f };
  };
  let dx = bx - ax, dy = by - ay;
  if (route !== "straight") {
    if (Math.abs(dx) >= Math.abs(dy)) { dx = Math.sign(dx) || 1; dy = 0; }
    else { dx = 0; dy = Math.sign(dy) || 1; }
  }
  if (!dx && !dy) dx = 1;
  return { a: edge(a, dx, dy), b: edge(b, -dx, -dy) };
}

// Shared by the canvas, live preview, and both export formats.
export function connectorPath(a: Point, b: Point, route: ConnectorRoute = "straight", horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
  const start = `M ${a.x} ${a.y}`;
  if (route === "straight") return { d: `${start} L ${b.x} ${b.y}`, tail: a, head: b };
  const c1 = horizontal ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 };
  const c2 = horizontal ? { x: c1.x, y: b.y } : { x: b.x, y: c1.y };
  return {
    d: route === "curved"
      ? `${start} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`
      : `${start} L ${c1.x} ${c1.y} L ${c2.x} ${c2.y} L ${b.x} ${b.y}`,
    tail: c2.x === b.x && c2.y === b.y ? a : c2,
    head: c1.x === a.x && c1.y === a.y ? b : c1,
  };
}

export function connectionGeometry(a: Item, b: Item, route: ConnectorRoute = "straight") {
  const ends = connectionPoints(a, b, route);
  const horizontal = Math.abs(b.x + b.w / 2 - a.x - a.w / 2) >=
    Math.abs(b.y + b.h / 2 - a.y - a.h / 2);
  return { ...ends, ...connectorPath(ends.a, ends.b, route, horizontal) };
}

export function snapConnection(items: Item[], p: Point, radius: number, exclude?: string) {
  const candidates = [...items].reverse().filter((i) => i.id !== exclude);
  let closest: Item | undefined, distance = Infinity;
  for (const i of candidates) {
    const dx = Math.max(i.x - p.x, 0, p.x - i.x - i.w);
    const dy = Math.max(i.y - p.y, 0, p.y - i.y - i.h);
    const d = Math.hypot(dx, dy);
    if (d <= radius && d < distance) { closest = i; distance = d; }
  }
  return closest;
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  downloadBlob(name, new Blob([content], { type }));
}
export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export async function packageBoard(board: Board): Promise<Board> {
  return {
    ...board,
    items: await Promise.all(
      board.items.map(async (i) => {
        if (i.kind !== "image" || !i.src?.startsWith("/")) return i;
        const res = await fetch(i.src);
        if (!res.ok) throw new Error("An image could not be packaged.");
        const blob = await res.blob();
        const src = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        return { ...i, src };
      }),
    ),
  };
}
export async function encodeShare(board: Board) {
  const stream = new Blob([JSON.stringify(board)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function decodeShare(value: string) {
  if (value.length > 1000000) throw new Error("Share link is too large.");
  const bytes = Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 30 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Share link data is too large.");
    }
    parts.push(value);
  }
  return validateBoard(JSON.parse(await new Blob(parts as BlobPart[]).text()));
}
export { shareHtml } from "./viewer";
