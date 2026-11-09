import { useState, useRef, useEffect, useCallback } from "react";
import type { PointerEvent as PE, CSSProperties } from "react";
import {
  MousePointer2,
  Hand,
  Type,
  PenLine,
  MoveUpRight,
  Shapes,
  Square,
  Circle,
  StickyNote,
  Sun,
  Moon,
  Plus,
  Minus,
  X,
  Search,
  Copy,
  Trash2,
  ArrowUpRight,
  ImagePlus,
  Link2,
  Undo2,
  Redo2,
  Check,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowUpToLine,
  ArrowDownToLine,
  LockKeyhole,
  ChevronDown,
  Download,
  FilePlus2,
  FolderOpen,
  Upload,
} from "lucide-react";
import {
  type Board,
  type Workspace,
  type Item,
  type Point,
  type ConnectorRoute,
  type ConnectorArrowheads,
  uid,
  colors,
  strokes,
  createBoard,
  initialWorkspace,
  safeUrl,
  embedUrl,
  linkItem,
  parseBoardFile,
  duplicateItems,
  bounds,
  connectionPoints,
  connectionGeometry,
  connectorPath,
  connectorArrowheads,
  connectorMarkers,
  snapConnection,
  arrowEndpoints,
  positionArrow,
  drawingConnectorPath,
  updateArrowBindings,
  download,
  shareHtml,
  packageBoard,
  encodeShare,
  decodeShare,
} from "./model";
import { canvasFont, shapePaths, sketchPath, penPath } from "./sketch";
import { readLegacy, saveWorkspace } from "./storage";
import { exportPng } from "./exportPng";
import { readTheme, saveTheme } from "./theme";
import { instagramEmbedDocument, instagramPermalink, instagramSandbox } from "./instagram";
type Tool = "select" | "hand" | "text" | "draw" | "connect" | "shape";
type Modal = "help" | "links" | "link" | "delete" | "reconnect" | null;
type Gesture = {
  kind: "pan" | "drag" | "resize" | "draw" | "shape" | "connect" | "marquee";
  start: Point;
  last: Point;
  before: Board;
  ids: string[];
  origin: Point;
  points: number[][];
  from?: string;
  connectionId?: string;
  arrowId?: string;
  fixedPoint?: Point;
  endpoint?: "from" | "to";
  selection?: string[];
  undoBefore?: Board;
  duplicate?: boolean;
  axis?: "x" | "y";
};
type BackupDirectory = {
  getFileHandle: (
    name: string,
    options: { create: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (content: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};
export default function App({ initial }: { initial?: Workspace }) {
  const [workspace, setWorkspace] = useState<Workspace>(
    () => {
      const loaded = initial || readLegacy();
      return { ...loaded, boards: loaded.boards.map((b) => updateArrowBindings(b, true)) };
    },
  );
  const fallback = useRef(createBoard());
  const board =
    workspace.boards.find((b) => b.id === workspace.active) || fallback.current;
  const [gallery, setGallery] = useState(!workspace.active),
    [tool, setTool] = useState<Tool>("select"),
    [locked, setLocked] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [interacting, setInteracting] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const [dark, setDark] = useState(
      () => readTheme() === "dark",
    ),
    [offset, setOffset] = useState<Point>({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1),
    [space, setSpace] = useState(false);
  const [menu, setMenu] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [searchIndex, setSearchIndex] = useState(0),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState("Saved");
  const [links, setLinks] = useState(""),
    [linkTitle, setLinkTitle] = useState(""),
    [shape, setShape] = useState<"rectangle" | "ellipse" | "note">("rectangle"),
    [fill, setFill] = useState("transparent"),
    [stroke, setStroke] = useState("#ffffff"),
    [weight, setWeight] = useState(2),
    [fontSize, setFontSize] = useState(24),
    [bold, setBold] = useState(false),
    [italic, setItalic] = useState(false),
    [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [history, setHistory] = useState<Board[]>([]),
    [future, setFuture] = useState<Board[]>([]),
    [preview, setPreview] = useState<Gesture | null>(null),
    [connecting, setConnecting] = useState<string | null>(null),
    [route, setRoute] = useState<ConnectorRoute>("straight"),
    [arrowheads, setArrowheads] = useState<ConnectorArrowheads>("one"),
    [selectedConnection, setSelectedConnection] = useState<string | null>(null),
    [snapTarget, setSnapTarget] = useState<string | null>(null),
    [context, setContext] = useState<Point | null>(null),
    [deleteId, setDeleteId] = useState(""),
    [busy, setBusy] = useState(false),
    [backup, setBackup] = useState(false);
  const [reconnectDraft, setReconnectDraft] = useState<{
    id: string; arrow: boolean; endpoint: "from" | "to"; target: string;
  } | null>(null);
  const reconnectHandle = useRef<SVGCircleElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null),
    files = useRef<HTMLInputElement>(null),
    imports = useRef<HTMLInputElement>(null),
    gesture = useRef<Gesture | null>(null),
    current = useRef(board),
    selection = useRef(selected),
    camera = useRef({ offset, zoom }),
    backupDir = useRef<BackupDirectory | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    clipboard = useRef<Item[]>([]),
    lastPointer = useRef<Point | null>(null),
    pinch = useRef<{
      distance: number;
      zoom: number;
      offset: Point;
      world: Point;
    } | null>(null),
    pointers = useRef(new Map<number, Point>()),
    shareLoaded = useRef(false);
  current.current = board;
  selection.current = selected;
  camera.current = { offset, zoom };
  useEffect(() => {
    if (interacting && (selected.length !== 1 || selected[0] !== interacting)) setInteracting(null);
  }, [selected, interacting]);
  const toast = useCallback((text: string) => {
    setNotice(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);
  const change = useCallback((next: Board, record = true) => {
    if (record) {
      const previous = current.current;
      setHistory((h) => [...h.slice(-79), previous]);
      setFuture([]);
    }
    next = updateArrowBindings(next);
    current.current = next;
    setWorkspace((w) => ({
      ...w,
      boards: w.boards.map((b) =>
        b.id === next.id ? { ...next, updated: Date.now() } : b,
      ),
    }));
  }, []);
  const update = (data: Partial<Item>) =>
    change({
      ...board,
      items: board.items.map((i) =>
        selected.includes(i.id) ? { ...i, ...data } : i,
      ),
    });
  const patch = (id: string, data: Partial<Item>) =>
    change(
      {
        ...current.current,
        items: current.current.items.map((i) =>
          i.id === id ? { ...i, ...data } : i,
        ),
      },
      false,
    );
  useEffect(() => {
    setSaved("Saving…");
    const timer = setTimeout(() => {
      void saveWorkspace(workspace)
        .then(() => setSaved("Saved"))
        .catch(() => {
          setSaved("Not saved");
          toast("Storage is full. Save a file to keep your changes.");
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [workspace, toast]);
  useEffect(() => {
    saveTheme(dark ? "dark" : "light");
    setStroke((current) =>
      current === "#ffffff" || current === "#0a0a0a"
        ? dark ? "#ffffff" : "#0a0a0a"
        : current,
    );
  }, [dark]);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  const point = (x: number, y: number): Point => {
    const r = canvas.current!.getBoundingClientRect(),
      c = camera.current;
    return {
      x: (x - r.left - c.offset.x) / c.zoom,
      y: (y - r.top - c.offset.y) / c.zoom,
    };
  };
  const center = (): Point => {
    const r = canvas.current?.getBoundingClientRect();
    return {
      x: ((r?.width || 1000) / 2 - offset.x) / zoom - 150,
      y: ((r?.height || 700) / 2 - offset.y) / zoom - 100,
    };
  };
  const chooseTool = (next: Tool) => {
    setInteracting(null);
    setSelectedConnection(null);
    setSnapTarget(null);
    setTool(next);
    if (next !== tool) setLocked(false);
    if (next !== "select" && next !== "hand") setSelected([]);
    setContext(null);
    setMenu(false);
    setConnecting(null);
    setEditing(null);
  };
  const finishTool = () => {
    if (!locked) setTool("select");
  };
  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };
  const fit = () => {
    if (!board.items.length) {
      reset();
      return;
    }
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return;
    const b = bounds(board.items),
      z = Math.max(
        0.1,
        Math.min(
          1.5,
          (r.width - 100) / (b.w + 1),
          (r.height - 130) / (b.h + 1),
        ),
      );
    setZoom(z);
    setOffset({
      x: (r.width - b.w * z) / 2 - b.x * z,
      y: (r.height - b.h * z) / 2 - b.y * z - 15,
    });
  };
  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const c = camera.current,
      r = canvas.current?.getBoundingClientRect(),
      x = cx ?? (r?.width || 1000) / 2,
      y = cy ?? (r?.height || 700) / 2,
      z = Math.max(0.1, Math.min(5, next));
    setOffset({
      x: x - ((x - c.offset.x) * z) / c.zoom,
      y: y - ((y - c.offset.y) * z) / c.zoom,
    });
    setZoom(z);
  };
  const openBoard = (id: string) => {
    chooseTool("select");
    setWorkspace((w) => ({ ...w, active: id }));
    setGallery(false);
    setSelected([]);
    setHistory([]);
    setFuture([]);
    setEditing(null);
    setSearch("");
    setContext(null);
    setMenu(false);
    reset();
  };
  const newBoard = () => {
    chooseTool("select");
    const b = createBoard();
    setWorkspace((w) => ({ boards: [...w.boards, b], active: b.id }));
    setGallery(false);
    setMenu(false);
    setSelected([]);
    setHistory([]);
    setFuture([]);
    setEditing(null);
    reset();
  };
  const insert = (items: Item[]) => {
    change({ ...current.current, items: [...current.current.items, ...items] });
    setSelected(items.map((i) => i.id));
    finishTool();
  };
  const addText = (at = center()) => {
    const i: Item = {
      id: uid(),
      kind: "text",
      ...at,
      w: 360,
      h: Math.max(80, fontSize * 3),
      text: "",
      fontSize,
      bold,
      italic,
      align,
    };
    insert([i]);
    setEditing(i.id);
  };
  const addNote = (at = center()) => {
    const i: Item = {
      id: uid(),
      kind: "note",
      ...at,
      w: 240,
      h: 180,
      text: "",
      fontSize: 20,
      color: fill === "transparent" ? colors[0] : fill,
      stroke: "transparent",
      strokeWidth: 2,
    };
    insert([i]);
    setEditing(i.id);
  };
  const duplicate = () => {
    const result = duplicateItems(board, selected);
    change(result.board);
    setSelected(result.ids);
  };
  const remove = () => {
    change({
      ...board,
      items: board.items.filter((i) => !selected.includes(i.id)),
      connections: board.connections.filter(
        (c) => !selected.includes(c.from) && !selected.includes(c.to),
      ),
    });
    setSelected([]);
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [board, ...f]);
    change(history.at(-1)!, false);
    setHistory((h) => h.slice(0, -1));
    setSelected([]);
    setEditing(null);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, board]);
    change(future[0], false);
    setFuture((f) => f.slice(1));
    setSelected([]);
    setEditing(null);
  };
  const moveLayer = (front: boolean) => {
    const chosen = board.items.filter((i) => selected.includes(i.id)),
      rest = board.items.filter((i) => !selected.includes(i.id));
    change({
      ...board,
      items: front ? [...rest, ...chosen] : [...chosen, ...rest],
    });
  };
  const save = async (format: "json" | "html" | "png") => {
    if (busy) return;
    setMenu(false);
    setBusy(true);
    try {
      const packaged = await packageBoard(current.current);
      if (format === "png") {
        await exportPng(packaged, dark);
      } else
        download(
          board.name + (format === "html" ? ".html" : ".rtboard"),
          format === "html" ? shareHtml(packaged) : JSON.stringify(packaged),
          format === "html" ? "text/html" : "application/json",
        );
      toast("Board exported");
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Export failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error("The file is larger than 100 MB.");
      const b = parseBoardFile(await file.text());
      setWorkspace((w) => ({ boards: [...w.boards, b], active: b.id }));
      setGallery(false);
      setSelected([]);
      setHistory([]);
      setFuture([]);
      reset();
      requestAnimationFrame(() => setZoom(1));
      toast("Board opened");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open this file.");
    }
  };
  const importLinks = (text: string) => {
    const urls = text.split(/\s+/).filter(Boolean),
      at = center(),
      items: Item[] = [];
    for (const url of urls) {
      if (safeUrl(url))
        items.push(
          linkItem(url, {
            x: at.x + (items.length % 3) * 510,
            y: at.y + Math.floor(items.length / 3) * 550,
          }),
        );
    }
    if (!items.length) {
      toast("Paste at least one complete http:// or https:// link.");
      return;
    }
    if (items.length > 100) {
      toast("Import up to 100 links at a time.");
      return;
    }
    if (linkTitle.trim() && items.length === 1)
      items[0].text = linkTitle.trim();
    insert(items);
    setModal(null);
    setLinks("");
    setLinkTitle("");
    toast(`${items.length} link${items.length === 1 ? "" : "s"} added`);
  };
  const readFiles = async (list: FileList | File[], at = center()) => {
    const imported: Item[] = [];
    for (const [index, file] of Array.from(list).entries()) {
      if (/\.(rtboard|json|html)$/i.test(file.name)) {
        await loadFile(file);
        continue;
      }
      if (
        !/^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp3|wav|ogg|x-m4a|mp4))$/.test(
          file.type,
        )
      ) {
        toast("Supported: images, MP4/WebM video, audio, and board files.");
        continue;
      }
      if (file.size > 40 * 1024 * 1024) {
        toast("Choose media smaller than 40 MB.");
        continue;
      }
      try {
        const src = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const kind = file.type.startsWith("image")
          ? "image"
          : file.type.startsWith("video")
            ? "video"
            : "audio";
        let w = kind === "audio" ? 360 : 480,
          h = kind === "audio" ? 90 : 270;
        if (kind === "image") {
          const size = await new Promise<{ w: number; h: number }>(
            (resolve, reject) => {
              const img = new Image();
              img.onload = () =>
                resolve({
                  w: Math.min(600, img.naturalWidth),
                  h:
                    (Math.min(600, img.naturalWidth) * img.naturalHeight) /
                    img.naturalWidth,
                });
              img.onerror = reject;
              img.src = src;
            },
          );
          w = size.w;
          h = size.h;
        }
        imported.push({
          id: uid(),
          kind,
          x: at.x + index * 30,
          y: at.y + index * 30,
          w,
          h,
          text: file.name,
          src,
        });
      } catch {
        toast("Could not open " + file.name);
      }
    }
    if (imported.length) insert(imported);
  };
  const copyShare = async () => {
    setMenu(false);
    try {
      const packed = await packageBoard(board),
        hash = await encodeShare(packed);
      if (hash.length > 120000) {
        toast(
          "This board is too large for a link. Export shareable HTML instead.",
        );
        return;
      }
      await navigator.clipboard.writeText(
        location.origin + location.pathname + "#board=" + hash,
      );
      toast("Share link copied");
    } catch {
      toast("Could not copy a link. Use Export shareable HTML instead.");
    }
  };
  useEffect(() => {
    if (shareLoaded.current) return;
    shareLoaded.current = true;
    const hash = location.hash;
    if (!hash.startsWith("#board=")) return;
    void decodeShare(hash.slice(7))
      .then((b) => {
        setWorkspace((w) => ({ boards: [...w.boards, b], active: b.id }));
        setGallery(false);
        toast("Shared board opened as an editable copy");
        window.history.replaceState(
          null,
          "",
          location.pathname + location.search,
        );
      })
      .catch(() => toast("This share link could not be opened."));
  }, [toast]);
  const setupBackup = async () => {
    setMenu(false);
    try {
      const picker = (
        window as unknown as {
          showDirectoryPicker?: () => Promise<BackupDirectory>;
        }
      ).showDirectoryPicker;
      if (!picker) {
        toast(
          "Folder backups require a browser with File System Access support. You can still save board files.",
        );
        return;
      }
      backupDir.current = await picker.call(window);
      setBackup(true);
      await writeBackup();
      toast("Auto-backup enabled. A copy is saved every 10 minutes.");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        toast("Could not set up the backup folder.");
    }
  };
  const writeBackup = async () => {
    if (!backupDir.current) return;
    const b = await packageBoard(current.current);
    const file = await backupDir.current.getFileHandle(
      b.name.replace(/[^\w .-]/g, "_") + ".rtboard",
      { create: true },
    );
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(b));
    await writable.close();
  };
  useEffect(() => {
    if (!backup) return;
    const timer = setInterval(() => {
      void writeBackup().catch(() =>
        toast("Auto-backup failed. Choose your backup folder again."),
      );
    }, 600000);
    return () => clearInterval(timer);
  }, [backup]);
  const begin = (
    kind: Gesture["kind"],
    e: PE,
    ids = selected,
    from?: string,
  ) => {
    const p = point(e.clientX, e.clientY);
    const g: Gesture = {
      kind,
      start: p,
      last: p,
      before: board,
      ids,
      origin: { x: e.clientX, y: e.clientY },
      points: [[p.x, p.y]],
      from,
      selection: e.shiftKey ? selected : [],
    };
    gesture.current = g;
    canvas.current?.setPointerCapture?.(e.pointerId);
    setPreview(g);
  };
  const cancelGesture = () => {
    const g = gesture.current;
    if (g && ["drag", "resize"].includes(g.kind)) {
      change(g.undoBefore || g.before, false);
      if (g.undoBefore) setSelected([]);
    }
    gesture.current = null;
    setPreview(null);
  };
  const down = (e: PE) => {
    const pan = tool === "hand" || space || e.button === 1;
    if (
      (e.target as HTMLElement)?.closest?.("[data-ui]") ||
      (!pan && (e.target as HTMLElement)?.closest?.("button,input,textarea,a,iframe,video,audio"))
    )
      return;
    if (e.button !== 0 && e.button !== 1) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()],
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        offset,
        world: point(mid.x, mid.y),
      };
      cancelGesture();
      return;
    }
    setMenu(false);
    setContext(null);
    setEditing(null);
    setInteracting(null);
    if (pan) {
      e.preventDefault();
      setSnapTarget(null);
      begin("pan", e);
      return;
    }
    if (tool === "text") {
      addText(point(e.clientX, e.clientY));
      return;
    }
    if (tool === "shape") {
      begin("shape", e);
      return;
    }
    if (tool === "draw") {
      begin("draw", e);
      return;
    }
    if (tool === "connect") {
      const source = snapConnection(board.items, point(e.clientX, e.clientY), 18 / zoom);
      if (connecting && source && source.id !== connecting) {
        change({ ...board, connections: [...board.connections, { id: uid(), from: connecting, to: source.id, route, arrowheads }] });
        setConnecting(null);
        setSnapTarget(null);
        finishTool();
      } else {
        setConnecting(source?.id || null);
        begin("connect", e, [], source?.id);
      }
      return;
    }
    if ((e.target as HTMLElement)?.closest?.(".board-item")) return;
    setSelected(e.shiftKey ? selected : []);
    setSelectedConnection(null);
    begin("marquee", e);
  };
  const itemDown = (e: PE, i: Item) => {
    if (
      (e.target as HTMLElement)?.closest?.(
        "button,textarea,a,iframe,video,audio",
      )
    )
      return;
    if (e.button !== 0 && e.button !== 1) return;
    if (space || e.button === 1) {
      e.stopPropagation();
      begin("pan", e);
      return;
    }
    if (tool === "connect" && i.kind === "drawing" && i.arrow) {
      e.stopPropagation();
      down(e as PE<HTMLDivElement>);
      return;
    }
    if (tool === "connect") {
      e.stopPropagation();
      if (connecting && connecting !== i.id) {
        change({
          ...board,
          connections: [
            ...board.connections,
            { id: uid(), from: connecting, to: i.id, route, arrowheads },
          ],
        });
        setConnecting(null);
        setSnapTarget(null);
        finishTool();
        return;
      }
      setConnecting(i.id);
      begin("connect", e, [i.id], i.id);
      return;
    }
    if (tool !== "select") return;
    setInteracting(null);
    setSelectedConnection(null);
    e.stopPropagation();
    setEditing(null);
    setContext(null);
    const ids = e.shiftKey
      ? selected.includes(i.id)
        ? selected.filter((id) => id !== i.id)
        : [...selected, i.id]
      : selected.includes(i.id)
        ? selected
        : [i.id];
    setSelected(ids);
    begin("drag", e, ids);
    gesture.current!.duplicate = e.altKey;
  };
  const move = (e: PE) => {
    lastPointer.current = point(e.clientX, e.clientY);
    if ((tool === "connect" && !space && gesture.current?.kind !== "pan") || gesture.current?.kind === "connect") {
      setSnapTarget(snapConnection(board.items, lastPointer.current, 18 / zoom,
        gesture.current?.from || connecting || undefined)?.id || null);
    }
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()],
        r = canvas.current!.getBoundingClientRect(),
        p = pinch.current,
        z = Math.max(
          0.1,
          Math.min(5, (p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / p.distance),
        );
      setZoom(z);
      setOffset({
        x: (a.x + b.x) / 2 - r.left - p.world.x * z,
        y: (a.y + b.y) / 2 - r.top - p.world.y * z,
      });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = point(e.clientX, e.clientY);
    if (g.kind === "pan") {
      const dx = e.clientX - g.origin.x, dy = e.clientY - g.origin.y;
      setOffset((o) => ({
        x: o.x + dx,
        y: o.y + dy,
      }));
      g.origin = { x: e.clientX, y: e.clientY };
      return;
    }
    if (g.kind === "shape" && e.shiftKey) {
      const size = Math.max(Math.abs(p.x - g.start.x), Math.abs(p.y - g.start.y));
      p.x = g.start.x + (p.x < g.start.x ? -size : size);
      p.y = g.start.y + (p.y < g.start.y ? -size : size);
    }
    g.last = p;
    if (g.kind === "drag") {
      let dx = (e.clientX - g.origin.x) / zoom,
        dy = (e.clientY - g.origin.y) / zoom;
      const pastThreshold = Math.hypot(dx, dy) > 3 / zoom;
      if (g.duplicate && !g.undoBefore) {
        if (!pastThreshold) return;
        const result = duplicateItems(g.before, g.ids, 0);
        g.undoBefore = g.before;
        g.before = result.board;
        g.ids = result.ids;
        setSelected(result.ids);
      }
      if (e.shiftKey) {
        if (!g.axis && pastThreshold) g.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (g.axis === "x") dy = 0;
        else if (g.axis === "y") dx = 0;
      } else g.axis = undefined;
      change(
        {
          ...g.before,
          items: g.before.items.map((i) =>
            g.ids.includes(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i,
          ),
        },
        false,
      );
    }
    if (g.kind === "resize") {
      const original = g.before.items.find((i) => i.id === g.ids[0])!;
      const w = Math.max(30, original.w + (e.clientX - g.origin.x) / zoom),
        h = e.shiftKey
          ? (w * original.h) / original.w
          : Math.max(24, original.h + (e.clientY - g.origin.y) / zoom);
      patch(original.id, {
        w,
        h,
        ...(original.points
          ? {
              points: original.points.map((p) => [
                (p[0] * w) / original.w,
                (p[1] * h) / original.h,
              ]),
            }
          : {}),
      });
    }
    if (g.kind === "draw") {
      g.points.push([p.x, p.y]);
    }
    if (g.kind === "marquee") {
      const x = Math.min(g.start.x, p.x),
        y = Math.min(g.start.y, p.y),
        w = Math.abs(p.x - g.start.x),
        h = Math.abs(p.y - g.start.y);
      setSelected([
        ...new Set([
          ...(g.selection || []),
          ...board.items
            .filter(
              (i) =>
                i.x < x + w && i.x + i.w > x && i.y < y + h && i.y + i.h > y,
            )
            .map((i) => i.id),
        ]),
      ]);
    }
    setPreview({ ...g });
  };
  const up = (e: PE) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (!g) return;
    if (g.kind === "connect") g.last = point(e.clientX, e.clientY);
    const dx = g.last.x - g.start.x,
      dy = g.last.y - g.start.y,
      moved = Math.hypot(dx, dy) > 3 / zoom;
    if ((g.kind === "drag" || g.kind === "resize") && (moved || g.undoBefore)) {
      setHistory((h) => [...h.slice(-79), g.undoBefore || g.before]);
      setFuture([]);
    }
    if (g.kind === "shape") {
      const at = {
          x: Math.min(g.start.x, g.last.x),
          y: Math.min(g.start.y, g.last.y),
        },
        i: Item = {
          id: uid(),
          kind: shape === "note" ? "note" : "shape",
          ...at,
          w: moved ? Math.max(30, Math.abs(dx)) : 240,
          h: moved ? Math.max(30, Math.abs(dy)) : 180,
          text: "",
          shape: shape === "ellipse" ? "ellipse" : "rectangle",
          color: shape === "note" && fill === "transparent" ? colors[0] : fill,
          stroke: shape === "note" ? "transparent" : stroke,
          strokeWidth: weight,
          fontSize: 20,
        };
      insert([i]);
      if (shape === "note") setEditing(i.id);
    }
    if (g.kind === "draw" && g.points.length > 2) {
      const x = Math.min(...g.points.map((p) => p[0])) - 4,
        y = Math.min(...g.points.map((p) => p[1])) - 4;
      insert([
        {
          id: uid(),
          kind: "drawing",
          x,
          y,
          w: Math.max(10, Math.max(...g.points.map((p) => p[0])) - x + 4),
          h: Math.max(10, Math.max(...g.points.map((p) => p[1])) - y + 4),
          text: "",
          stroke,
          strokeWidth: weight,
          points: g.points.map((p) => [p[0] - x, p[1] - y]),
        },
      ]);
    }
    if (g.kind === "connect" && (moved || g.connectionId || g.arrowId)) {
      const to = snapConnection(board.items, point(e.clientX, e.clientY), 18 / zoom, g.from);
      if (g.arrowId) {
        const release = point(e.clientX, e.clientY);
        change({ ...board, items: board.items.map((i) => {
          if (i.id !== g.arrowId) return i;
          const ends = arrowEndpoints(i);
          if (g.endpoint === "from") ends.a = release;
          else ends.b = release;
          return positionArrow({ ...i, bindingsInitialized: true,
            [g.endpoint === "from" ? "startBinding" : "endBinding"]: to?.id }, ends.a, ends.b);
        }) });
        setSnapTarget(null);
        return;
      }
      if (g.connectionId) {
        if (to) change({ ...board, connections: board.connections.map((c) =>
          c.id === g.connectionId ? { ...c, [g.endpoint!]: to.id } : c) });
        setSnapTarget(null);
        return;
      }
      if (g.from && to && to.id !== g.from) {
        change({
          ...board,
          connections: [
            ...board.connections,
            { id: uid(), from: g.from, to: to.id, route, arrowheads },
          ],
        });
      } else {
        const x = Math.min(g.start.x, g.last.x) - 5,
          y = Math.min(g.start.y, g.last.y) - 5;
        insert([
          {
            id: uid(),
            kind: "drawing",
            x,
            y,
            w: Math.abs(dx) + 10,
            h: Math.abs(dy) + 10,
            text: "",
            stroke,
            strokeWidth: weight,
            arrow: true,
            route,
            arrowheads,
            startBinding: g.from,
            endBinding: to?.id,
            bindingsInitialized: true,
            points: [
              [g.start.x - x, g.start.y - y],
              [g.last.x - x, g.last.y - y],
            ],
          },
        ]);
      }
      setConnecting(null);
      setSnapTarget(null);
      finishTool();
    }
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el || gallery) return;
    const wheel = (e: WheelEvent) => {
      if (
        (e.target as HTMLElement)?.closest?.(
          "textarea,iframe,video,audio,[data-ui]",
        )
      )
        return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const r = el.getBoundingClientRect();
        zoomAt(
          camera.current.zoom * Math.exp(-e.deltaY * 0.008),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else setOffset((o) => ({ x: o.x - (e.shiftKey ? e.deltaY : e.deltaX), y: o.y - (e.shiftKey ? e.deltaX : e.deltaY) }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [gallery]);
  const closeReconnect = () => {
    setModal(null);
    setReconnectDraft(null);
    requestAnimationFrame(() => reconnectHandle.current?.focus());
  };
  const commitReconnect = () => {
    if (!reconnectDraft) return;
    const { id, arrow, endpoint, target } = reconnectDraft;
    if (arrow) {
      change({ ...board, items: board.items.map((i) => i.id === id ? {
        ...i, bindingsInitialized: true,
        [endpoint === "from" ? "startBinding" : "endBinding"]: target || undefined,
      } : i) });
    } else if (target) {
      change({ ...board, connections: board.connections.map((c) => c.id === id ? { ...c, [endpoint]: target } : c) });
    }
    closeReconnect();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal === "reconnect") {
          e.preventDefault();
          closeReconnect();
          return;
        }
        cancelGesture();
        setModal(null);
        setMenu(false);
        setSearchOpen(false);
        setSearch("");
        setEditing(null);
        setSelected([]);
        setConnecting(null);
        setContext(null);
        chooseTool("select");
        return;
      }
      if (
        (e.target as HTMLElement)?.closest?.(
          "input,textarea,select,[contenteditable]",
        ) ||
        modal
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space" && !gallery) {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (gallery) return;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newBoard();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedConnection(null);
        setSelected(board.items.map((i) => i.id));
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key === "d") {
        e.preventDefault();
        duplicate();
      } else if (mod && (e.key === "f" || e.key === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && e.key === "s") {
        e.preventDefault();
        void save("json");
      } else if (mod && e.key === "0") {
        e.preventDefault();
        reset();
      } else if (mod && e.key === "1") {
        e.preventDefault();
        fit();
      } else if (mod && e.key === "c" && selected.length) {
        clipboard.current = board.items.filter((i) => selected.includes(i.id));
      } else if (["Delete", "Backspace"].includes(e.key) && selectedConnection) {
        e.preventDefault();
        change({ ...board, connections: board.connections.filter((c) => c.id !== selectedConnection) });
        setSelectedConnection(null);
      } else if (["Delete", "Backspace"].includes(e.key) && selected.length) {
        e.preventDefault();
        remove();
      } else if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
        selected.length
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        change({
          ...board,
          items: board.items.map((i) =>
            selected.includes(i.id)
              ? {
                  ...i,
                  x:
                    i.x +
                    (e.key === "ArrowRight"
                      ? step
                      : e.key === "ArrowLeft"
                        ? -step
                        : 0),
                  y:
                    i.y +
                    (e.key === "ArrowDown"
                      ? step
                      : e.key === "ArrowUp"
                        ? -step
                        : 0),
                }
              : i,
          ),
        });
      } else if (!mod) {
        if (!e.altKey && !e.isComposing && ["t", "8"].includes(e.key.toLowerCase())) {
          e.preventDefault();
          if (!e.repeat) {
            chooseTool("select");
            addText(lastPointer.current || center());
          }
          return;
        }
        const tools: Record<string, Tool> = {
          v: "select",
          h: "hand",
          p: "draw",
          x: "draw",
          a: "connect",
          "1": "select",
          "2": "shape",
          "5": "connect",
          "7": "draw",
          c: "connect",
          s: "shape",
        };
        if (tools[e.key.toLowerCase()]) chooseTool(tools[e.key.toLowerCase()]);
        if (["r", "o", "2", "4"].includes(e.key.toLowerCase())) {
          setShape(["o", "4"].includes(e.key.toLowerCase()) ? "ellipse" : "rectangle");
          chooseTool("shape");
        }
        if (e.key === "?") setModal("help");
        if (e.key === "n") {
          setShape("note");
          chooseTool("shape");
        }
        if (e.key === "+" || e.key === "=") zoomAt(zoom * 1.2);
        if (e.key === "-") zoomAt(zoom / 1.2);
      }
    };
    const release = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    const blur = () => {
      setSpace(false);
      pointers.current.clear();
      pinch.current = null;
      cancelGesture();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  });
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      if (
        gallery ||
        modal ||
        !selected.length ||
        (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")
      )
        return;
      e.preventDefault();
      const items = board.items.filter((i) => selected.includes(i.id));
      const connections = board.connections.filter(
        (c) => selected.includes(c.from) && selected.includes(c.to),
      );
      e.clipboardData?.setData(
        "application/x-rtboard",
        JSON.stringify({ name: "Clipboard", items, connections }),
      );
      e.clipboardData?.setData(
        "text/plain",
        items.map((i) => i.text).join("\n"),
      );
      clipboard.current = items;
      toast("Selection copied");
    };
    const paste = (e: ClipboardEvent) => {
      if (
        gallery ||
        modal ||
        (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")
      )
        return;
      const custom = e.clipboardData?.getData("application/x-rtboard");
      if (custom) {
        e.preventDefault();
        try {
          const copied = parseBoardFile(custom);
          const duplicated = duplicateItems(
            copied,
            copied.items.map((i) => i.id),
          );
          change({
            ...board,
            items: [
              ...board.items,
              ...duplicated.board.items.filter((i) =>
                duplicated.ids.includes(i.id),
              ),
            ],
            connections: [
              ...board.connections,
              ...duplicated.board.connections.filter(
                (c) =>
                  duplicated.ids.includes(c.from) &&
                  duplicated.ids.includes(c.to),
              ),
            ],
          });
          setSelected(duplicated.ids);
        } catch {
          toast("The clipboard does not contain valid board items.");
        }
        return;
      }
      if (e.clipboardData?.files.length) {
        e.preventDefault();
        void readFiles(e.clipboardData.files);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        e.preventDefault();
        if (
          text
            .trim()
            .split(/\s+/)
            .every((t) => safeUrl(t))
        )
          importLinks(text);
        else {
          const at = center();
          insert([
            {
              id: uid(),
              kind: "text",
              ...at,
              w: 360,
              h: 180,
              text,
              fontSize: 24,
            },
          ]);
        }
      } else if (clipboard.current.length) {
        e.preventDefault();
        insert(
          clipboard.current.map((i) => ({
            ...i,
            id: uid(),
            x: i.x + 24,
            y: i.y + 24,
          })),
        );
      }
    };
    window.addEventListener("copy", copy);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("copy", copy);
      window.removeEventListener("paste", paste);
    };
  });
  useEffect(() => {
    if (!modal) return;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]"),
      previous = document.activeElement as HTMLElement,
      els = () =>
        Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            "button,input,textarea,a[href]",
          ) || [],
        );
    (dialog?.querySelector<HTMLElement>("input,textarea") || els()[0])?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = els(),
        index = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && index === 0) {
        e.preventDefault();
        list.at(-1)?.focus();
      } else if (!e.shiftKey && index === list.length - 1) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  const results = board.items.filter((i) =>
    i.text.toLowerCase().includes(search.toLowerCase()),
  );
  const jump = (index: number) => {
    if (!results.length) return;
    const next = (index + results.length) % results.length;
    setSearchIndex(next);
    const i = results[next],
      r = canvas.current!.getBoundingClientRect();
    setSelected([i.id]);
    setOffset({
      x: r.width / 2 - (i.x + i.w / 2) * zoom,
      y: r.height / 2 - (i.y + i.h / 2) * zoom,
    });
  };
  useEffect(() => {
    if (search && searchOpen) jump(0);
  }, [search]);
  const active = board.items.find((i) => i.id === selected[0]);
  const selectedBounds = selected.length > 1 ? bounds(board.items.filter((i) => selected.includes(i.id))) : null;
  const activeConnection = board.connections.find((c) => c.id === selectedConnection);
  const reconnectItem = reconnectDraft?.arrow ? board.items.find((i) => i.id === reconnectDraft.id) : undefined;
  const reconnectConnection = !reconnectDraft?.arrow ? board.connections.find((c) => c.id === reconnectDraft?.id) : undefined;
  const reconnectFixed = reconnectDraft?.endpoint === "from"
    ? reconnectItem?.endBinding || reconnectConnection?.to
    : reconnectItem?.startBinding || reconnectConnection?.from;
  const reconnectTargets = board.items.filter((i) => i.id !== reconnectFixed && !(i.kind === "drawing" && i.arrow));
  const currentRoute = activeConnection ? activeConnection.route || "straight"
    : active?.arrow ? active.route || "straight" : route;
  const currentArrowheads = connectorArrowheads(activeConnection ? activeConnection.arrowheads
    : active?.arrow ? active.arrowheads : arrowheads);
  const previewArrowheads = preview?.connectionId
    ? board.connections.find((c) => c.id === preview.connectionId)?.arrowheads
    : preview?.arrowId ? board.items.find((i) => i.id === preview.arrowId)?.arrowheads : arrowheads;
  const previewRoute = preview?.connectionId
    ? board.connections.find((c) => c.id === preview.connectionId)?.route || "straight"
    : preview?.arrowId ? board.items.find((i) => i.id === preview.arrowId)?.route || "straight" : route;
  const previewSource = board.items.find((i) => i.id === preview?.from);
  const previewTarget = board.items.find((i) => i.id === snapTarget);
  const previewOther: Item | undefined = preview && (previewTarget || {
    id: "preview", kind: "shape", text: "", ...preview.last, w: 1, h: 1,
  }) || undefined;
  const previewFixed: Item | undefined = previewSource || (preview?.fixedPoint ? {
    id: "fixed", kind: "shape", text: "", x: preview.fixedPoint.x - 0.5, y: preview.fixedPoint.y - 0.5, w: 1, h: 1,
  } : undefined);
  const previewPath = previewFixed && previewOther
    ? connectionGeometry(
      preview?.endpoint === "from" ? previewOther : previewFixed,
      preview?.endpoint === "from" ? previewFixed : previewOther,
      previewRoute,
    ).d
    : connectorPath(preview?.start || { x: 0, y: 0 }, preview?.last || { x: 0, y: 0 }, previewRoute).d;
  const textStyle = (i: Item): CSSProperties => ({
    fontFamily: ["text", "note", "shape"].includes(i.kind) ? canvasFont : undefined,
    fontSize: i.fontSize || 20,
    fontWeight: i.bold ? 700 : 400,
    fontStyle: i.italic ? "italic" : "normal",
    textAlign: i.align || "left",
    ...(i.kind === "text" && i.stroke ? { color: i.stroke } : {}),
  });
  const toolButtons = [
    { id: "select", Icon: MousePointer2, label: "Select", key: "V" },
    { id: "hand", Icon: Hand, label: "Hand", key: "H" },
    { id: "text", Icon: Type, label: "Text", key: "T" },
    { id: "draw", Icon: PenLine, label: "Draw", key: "P" },
    { id: "connect", Icon: MoveUpRight, label: "Connector", key: "C" },
    { id: "shape", Icon: Shapes, label: "Shapes", key: "S" },
  ] as const;
  const effectiveTool = tool === "hand" || space || preview?.kind === "pan" ? "hand" : tool;
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="wordmark"
          title="All boards"
          onClick={() => {
            setGallery(true);
            setEditing(null);
            setMenu(false);
          }}
        >
          rtboard
        </button>
        {!gallery && (
          <>
            <span className="header-divider" />
            <input
              key={board.id}
              className="board-name"
              aria-label="Board name"
              defaultValue={board.name}
              maxLength={120}
              onBlur={(e) => {
                const name = e.target.value.trim() || "Untitled board";
                e.target.value = name;
                if (name !== board.name) change({ ...board, name });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </>
        )}
        <div className="header-actions">
          {!gallery && (
            <>
              <span
                className={`save-status ${saved === "Not saved" ? "error" : ""}`}
                role="status"
              >
                {saved}
                {backup ? " · Backed up" : ""}
              </span>
              <button
                className="header-button"
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
                onClick={() => setModal("help")}
              >
                ?
              </button>
            </>
          )}
          <button
            className="header-button theme-toggle"
            aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            title={`${dark ? "Light" : "Dark"} mode`}
            onClick={() => setDark((current) => !current)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>
          {gallery ? (
            <button className="file-button" onClick={newBoard}>
              <Plus size={14} /> New board
            </button>
          ) : (
            <button
              className="file-button"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              File
            </button>
          )}
        </div>
      </header>
      {gallery ? (
        <main className="gallery">
          {workspace.boards.length === 0 ? (
            <div className="gallery-empty">
              <h1>No boards yet</h1>
              <button className="primary" onClick={newBoard}>
                Create your first board
              </button>
              <button
                className="text-button"
                onClick={() => imports.current?.click()}
              >
                Open a board file
              </button>
            </div>
          ) : (
            <>
              <div className="gallery-title">
                <h1>Your boards</h1>
                <button
                  onClick={() => imports.current?.click()}
                  className="secondary"
                >
                  <FolderOpen size={15} /> Open board
                </button>
              </div>
              <div className="boards-grid">
                {workspace.boards.map((b) => (
                  <article key={b.id} className="board-tile">
                    <button
                      className="board-preview"
                      aria-label={`Open ${b.name}`}
                      onClick={() => openBoard(b.id)}
                    >
                      {b.items.length ? (
                        <div
                          className="thumbnail-world"
                          style={{
                            transform: `scale(${Math.min(280 / (bounds(b.items).w + 60), 145 / (bounds(b.items).h + 40))}) translate(${-bounds(b.items).x + 20}px,${-bounds(b.items).y + 20}px)`,
                          }}
                        >
                          {b.items.slice(0, 40).map((i) => (
                            <div
                              key={i.id}
                              style={{
                                position: "absolute",
                                left: i.x,
                                top: i.y,
                                width: i.w,
                                height: i.h,
                                background:
                                  i.kind === "note" ? i.color : undefined,
                                border:
                                  i.kind === "shape"
                                    ? `2px solid ${i.stroke || "#888"}`
                                    : undefined,
                                borderRadius: i.shape === "ellipse" ? "50%" : 0,
                                overflow: "hidden",
                                fontSize: i.fontSize || 20,
                                padding: i.kind === "note" ? 20 : 0,
                              }}
                            >
                              {i.kind === "image" ? (
                                <img src={i.src} alt="" />
                              ) : i.kind === "link" ? (
                                <div className="thumb-link">
                                  <Link2 size={28} />
                                  {i.text}
                                </div>
                              ) : (
                                i.text
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="empty-thumbnail">Empty board</span>
                      )}
                    </button>
                    <div className="board-tile-info">
                      <button onClick={() => openBoard(b.id)}>{b.name}</button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${b.name}`}
                        onClick={() => {
                          setDeleteId(b.id);
                          setModal("delete");
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <small>
                      {b.items.length} items ·{" "}
                      {new Date(b.updated).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </article>
                ))}
              </div>
            </>
          )}
        </main>
      ) : (
        <main
          ref={canvas}
          className={`canvas tool-${tool} ${effectiveTool === "hand" ? "panning" : ""} ${preview?.kind === "pan" ? "is-panning" : ""} ${preview?.kind === "drag" ? "is-dragging" : ""}`}
          onPointerDownCapture={(e) => {
            if ((e.button !== 0 && e.button !== 1) ||
                (e.target as HTMLElement)?.closest?.("[data-ui]")) return;
            if (tool === "hand" || space || e.button === 1) {
              // Capture panning before item, link, media, or endpoint handlers.
              e.stopPropagation();
              down(e);
            }
          }}
          onPointerDown={down}
          onAuxClickCapture={(e) => {
            if (e.button === 1 && !(e.target as HTMLElement)?.closest?.("[data-ui]")) e.preventDefault();
          }}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            pinch.current = null;
            cancelGesture();
          }}
          onDoubleClick={(e) => {
            if (
              tool === "select" && !space &&
              !(e.target as HTMLElement)?.closest?.(".board-item,[data-ui]")
            )
              addNote(point(e.clientX, e.clientY));
          }}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement)?.closest?.("textarea,input,iframe"))
              return;
            e.preventDefault();
            setContext({
              x: Math.min(e.clientX, innerWidth - 220),
              y: Math.min(e.clientY, innerHeight - 360),
            });
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const at = point(e.clientX, e.clientY);
            if (e.dataTransfer.files.length)
              void readFiles(e.dataTransfer.files, at);
            else {
              const text =
                e.dataTransfer.getData("text/uri-list") ||
                e.dataTransfer.getData("text/plain");
              if (safeUrl(text)) insert([linkItem(text, at)]);
            }
          }}
          style={{
            backgroundPosition: `${offset.x}px ${offset.y}px`,
            backgroundSize: `${Math.max(14, 24 * zoom)}px ${Math.max(14, 24 * zoom)}px`,
          }}
        >
          <div
            className="world"
            style={{
              transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
            }}
          >
            <svg className="connections">
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeOpacity="1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              {board.connections.map((c) => {
                const a = board.items.find((i) => i.id === c.from),
                  b = board.items.find((i) => i.id === c.to);
                if (!a || !b) return null;
                const p = connectionGeometry(a, b, c.route);
                return (
                  <g
                    key={c.id}
                    style={{ color: selectedConnection === c.id ? "var(--selection)" : undefined }}
                    onPointerDown={(e) => {
                      if (tool !== "select" || space) return;
                      e.stopPropagation();
                      setSelected([]);
                      setSelectedConnection(c.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      change({ ...board, connections: board.connections.filter((x) => x.id !== c.id) });
                      setSelectedConnection(null);
                    }}
                  >
                    <path data-connection-id={c.id} data-geometry={p.d} d={sketchPath(p.d, c.id)} fill="none"
                      className={`connector-line ${selectedConnection === c.id ? "selected" : ""}`} />
                    <path d={p.d} fill="none" stroke="currentColor" strokeOpacity="0" strokeWidth="2" {...connectorMarkers(c.arrowheads)} />
                    <path d={p.d} className="connector-hit" />
                  </g>
                );
              })}
            </svg>
            {selectedBounds && tool === "select" && (
              <div className="group-selection" aria-label="Drag selected elements"
                style={{ left: selectedBounds.x - 6, top: selectedBounds.y - 6,
                  width: selectedBounds.w + 12, height: selectedBounds.h + 12 }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.shiftKey) return;
                  e.stopPropagation();
                  setInteracting(null);
                  setEditing(null);
                  begin("drag", e, selected);
                }}
                onDoubleClick={(e) => e.stopPropagation()} />
            )}
            {board.items.map((i) => (
              <div
                key={i.id}
                data-item-id={i.id}
                className={`board-item item-${i.kind} ${selected.includes(i.id) ? "selected" : ""} ${connecting === i.id ? "connecting" : ""} ${snapTarget === i.id ? "snap-target" : ""} ${search && !i.text.toLowerCase().includes(search.toLowerCase()) ? "dimmed" : ""}`}
                style={{
                  left: i.x,
                  top: i.y,
                  width: i.w,
                  height: i.h,
                  ...textStyle(i),
                  ...(i.kind === "note" || i.kind === "shape"
                    ? {
                        background: i.kind === "note" ? i.color : "transparent",
                        borderRadius: i.shape === "ellipse" ? "50%" : 4,
                      }
                    : {}),
                  ...(i.kind === "drawing"
                    ? { color: i.stroke || "var(--ink)" }
                    : {}),
                }}
                onPointerDown={(e) => itemDown(e, i)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (tool !== "select" || space) return;
                  if (["link", "video", "audio"].includes(i.kind)) {
                    setSelected([i.id]);
                    setInteracting(i.id);
                  }
                  if (["text", "note", "shape"].includes(i.kind)) {
                    setSelected([i.id]);
                    setEditing(i.id);
                  }
                }}
                onContextMenu={() => {
                  if (!selected.includes(i.id)) setSelected([i.id]);
                }}
              >
                {i.kind === "shape" && (
                  <svg className="sketch-shape" viewBox={`0 0 ${i.w} ${i.h}`} preserveAspectRatio="none" aria-hidden="true">
                    {shapePaths(i).map((p, n) => <path key={n} d={p.d} fill={p.fill || "none"} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
                  </svg>
                )}
                {i.kind === "image" && (
                  <img
                    src={i.src}
                    alt={i.text}
                    width={i.w}
                    height={i.h}
                    draggable={false}
                  />
                )}
                {(i.kind === "video" || i.kind === "audio") &&
                  (i.kind === "video" ? (
                    <video src={i.src} controls preload="metadata" />
                  ) : (
                    <audio src={i.src} controls preload="metadata" />
                  ))}
                {["text", "note", "shape"].includes(i.kind) &&
                  (editing === i.id ? (
                    <textarea
                      autoFocus
                      aria-label="Edit text"
                      value={i.text}
                      style={textStyle(i)}
                      placeholder="Type something…"
                      onChange={(e) => patch(i.id, { text: e.target.value })}
                      onFocus={() => {
                        setHistory((h) => [...h.slice(-79), board]);
                        setFuture([]);
                      }}
                      onBlur={() => {
                        setEditing(null);
                        if (!i.text.trim() && i.kind === "text")
                          change(
                            {
                              ...current.current,
                              items: current.current.items.filter(
                                (x) => x.id !== i.id,
                              ),
                            },
                            false,
                          );
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="card-text">{i.text}</div>
                  ))}
                {i.kind === "drawing" && (
                  <svg viewBox={`0 0 ${i.w} ${i.h}`} preserveAspectRatio="none">
                    {i.arrow && i.points && i.points.length > 1 ? (
                      <>
                      <path
                        data-geometry={drawingConnectorPath(i, board.items, true).d}
                        d={sketchPath(drawingConnectorPath(i, board.items, true).d, i.id, i.strokeWidth)}
                        fill="none" stroke="currentColor" strokeWidth={i.strokeWidth || 2}
                        strokeLinecap="round" strokeLinejoin="round"
                      />
                      <path d={drawingConnectorPath(i, board.items, true).d} fill="none" stroke="currentColor" strokeOpacity="0"
                        strokeWidth={i.strokeWidth || 2} {...connectorMarkers(i.arrowheads)} />
                      </>
                    ) : (
                      <path
                        d={penPath(i.points)}
                        fill="none" stroke="currentColor" strokeWidth={i.strokeWidth || 2}
                        strokeLinecap="round" strokeLinejoin="round"
                      />
                    )}
                  </svg>
                )}
                {i.kind === "link" && (
                  <>
                    {embedUrl(i.src || "") ? (
                      <iframe
                        src={embedUrl(i.src || "")!}
                        srcDoc={instagramEmbedDocument(i.src || "")}
                        sandbox={instagramPermalink(i.src || "") ? instagramSandbox : undefined}
                        title={i.text}
                        loading="lazy"
                        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                        allowFullScreen
                        style={{
                          pointerEvents:
                            tool === "select" && !space && preview?.kind !== "pan" &&
                            (!selected.includes(i.id) || interacting === i.id) ? "auto" : "none",
                        }}
                      />
                    ) : (
                      <div className="bookmark">
                        <Link2 size={22} />
                        <strong>{i.text}</strong>
                        <a href={i.src} target="_blank" rel="noreferrer">
                          Open link <ArrowUpRight size={14} />
                        </a>
                      </div>
                    )}
                    <div className="embed-footer" title="Middle-drag this footer to pan. Use Hand mode to pan over the player.">
                      <span>{i.src?.replace(/^https?:\/\/(www\.)?/, "")}</span>
                      <a
                        href={i.src}
                        aria-label={`Open ${i.text}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ArrowUpRight size={12} />
                      </a>
                    </div>
                  </>
                )}
                {selected.includes(i.id) && (
                  <>
                    {["link", "video", "audio"].includes(i.kind) && tool === "select" && (
                      <>
                        {interacting !== i.id && <div className="media-drag-surface" aria-label={`Drag ${i.text || "media"}`} />}
                        <button className="media-interact" aria-label={interacting === i.id ? "Done interacting" : "Interact with media"}
                          onClick={() => {
                            setSelected([i.id]);
                            setInteracting(interacting === i.id ? null : i.id);
                          }}>{interacting === i.id ? "Done interacting" : "Interact"}</button>
                      </>
                    )}
                    {tool === "select" && <div className="selection-drag-frame" aria-label="Drag selected element">
                      <span className="drag-edge top" /><span className="drag-edge right" />
                      <span className="drag-edge bottom" /><span className="drag-edge left" />
                    </div>}
                    <span className="selection-handle tl" />
                    <span className="selection-handle tr" />
                    <span className="selection-handle bl" />
                    <button
                      className="selection-handle br"
                      title="Drag to resize"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        begin("resize", e, [i.id]);
                      }}
                    />
                  </>
                )}
              </div>
            ))}
            {preview && ["shape", "marquee"].includes(preview.kind) && (
              <div
                className={
                  preview.kind === "marquee" ? "marquee" : "shape-preview"
                }
                style={{
                  left: Math.min(preview.start.x, preview.last.x),
                  top: Math.min(preview.start.y, preview.last.y),
                  width: Math.abs(preview.last.x - preview.start.x),
                  height: Math.abs(preview.last.y - preview.start.y),
                  ...(preview.kind === "shape"
                    ? {
                        background:
                          shape === "note"
                            ? (fill === "transparent" ? colors[0] : fill)
                            : "transparent",
                        borderRadius: shape === "ellipse" ? "50%" : 4,
                      }
                    : {}),
                }}
              >
                {preview.kind === "shape" && shape !== "note" && (
                  <svg className="sketch-shape" aria-hidden="true">
                    {shapePaths({ id: "preview", kind: "shape", text: "", x: 0, y: 0,
                      w: Math.abs(preview.last.x - preview.start.x), h: Math.abs(preview.last.y - preview.start.y),
                      shape, color: fill, stroke, strokeWidth: weight,
                    }).map((p, n) => <path key={n} d={p.d} fill={p.fill || "none"} stroke={p.stroke} strokeWidth={p.strokeWidth} />)}
                  </svg>
                )}
              </div>
            )}
            {(activeConnection || active?.arrow) && !preview && (() => {
              const a = board.items.find((i) => i.id === activeConnection?.from);
              const b = board.items.find((i) => i.id === activeConnection?.to);
              if (activeConnection && (!a || !b)) return null;
              const ends = activeConnection ? connectionPoints(a!, b!, activeConnection.route) : arrowEndpoints(active!);
              return <svg className="connections connector-handles">
                {(["from", "to"] as const).map((endpoint) => {
                  const p = endpoint === "from" ? ends.a : ends.b;
                  return <circle key={endpoint} cx={p.x} cy={p.y} r={6 / zoom}
                    className="connector-endpoint" aria-label={`Reconnect ${endpoint === "from" ? "start" : "end"}`}
                    role="button" tabIndex={0} aria-haspopup="dialog"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      reconnectHandle.current = e.currentTarget;
                      setReconnectDraft({ id: activeConnection?.id || active!.id, arrow: !activeConnection, endpoint,
                        target: activeConnection ? activeConnection[endpoint]
                          : (endpoint === "from" ? active!.startBinding : active!.endBinding) || "" });
                      setModal("reconnect");
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const fixed = activeConnection
                        ? endpoint === "from" ? activeConnection.to : activeConnection.from
                        : endpoint === "from" ? active!.endBinding : active!.startBinding;
                      begin("connect", e, [], fixed);
                      gesture.current!.connectionId = activeConnection?.id;
                      gesture.current!.arrowId = activeConnection ? undefined : active!.id;
                      gesture.current!.fixedPoint = endpoint === "from" ? ends.b : ends.a;
                      gesture.current!.endpoint = endpoint;
                      setPreview({ ...gesture.current! });
                    }} />;
                })}
              </svg>;
            })()}
            {preview && ["draw", "connect"].includes(preview.kind) && (
              <svg className="connections">
                {preview.kind === "connect" ? (
                  <path d={previewPath}
                    fill="none" stroke="var(--selection)" strokeWidth={weight}
                    strokeLinecap="round" strokeLinejoin="round" {...connectorMarkers(previewArrowheads)} />
                ) : (
                  <path d={penPath(preview.points)}
                    fill="none" stroke={stroke} strokeWidth={weight} strokeLinecap="round" />
                )}
              </svg>
            )}
          </div>
          {!board.items.length && !preview && (
            <div className="empty-board">
              <h1>Empty board</h1>
              <p>Drag in images, videos, audio, or links, or paste a URL</p>
              <small>…or pick a tool below to write and draw</small>
            </div>
          )}
          {(tool === "shape" ||
            tool === "draw" ||
            tool === "connect" ||
            tool === "text" ||
            selected.length > 0 || activeConnection) && (
            <div
              className="properties"
              data-ui
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(tool === "connect" || activeConnection || active?.arrow) && (
                <div className="property-row connector-routes" role="group" aria-label="Connector route">
                  {(["straight", "curved", "elbow"] as const).map((value) => (
                    <button key={value} aria-label={`${value[0].toUpperCase()}${value.slice(1)}`}
                      aria-pressed={currentRoute === value}
                      className={currentRoute === value ? "active" : ""}
                      onClick={() => {
                        setRoute(value);
                        if (activeConnection) change({ ...board, connections: board.connections.map((c) =>
                          c.id === activeConnection.id ? { ...c, route: value } : c) });
                        else if (active?.arrow) update({ route: value });
                      }}>
                      <svg viewBox="0 0 24 18" width="24" height="18" aria-hidden="true">
                        <path d={connectorPath({ x: 2, y: 3 }, { x: 22, y: 15 }, value).d}
                          fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      {value[0].toUpperCase()}{value.slice(1)}
                    </button>
                  ))}
                </div>
              )}
              {(tool === "connect" || activeConnection || active?.arrow) && (
                <div className="property-row connector-routes" role="group" aria-label="Connector arrowheads">
                  {([
                    { value: "one", label: "One end" },
                    { value: "both", label: "Both ends" },
                    { value: "none", label: "None" },
                  ] as const).map(({ value, label }) => (
                    <button key={value} aria-label={label} aria-pressed={currentArrowheads === value}
                      className={currentArrowheads === value ? "active" : ""}
                      onClick={() => {
                        setArrowheads(value);
                        if (activeConnection) change({ ...board, connections: board.connections.map((c) =>
                          c.id === activeConnection.id ? { ...c, arrowheads: value } : c) });
                        else if (active?.arrow) update({ arrowheads: value });
                      }}>
                      <svg viewBox="0 0 24 18" width="24" height="18" aria-hidden="true">
                        <path d={`M 3 9 H 21${value !== "none" ? " M 17 5 L 21 9 L 17 13" : ""}${value === "both" ? " M 7 5 L 3 9 L 7 13" : ""}`}
                          fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {tool === "shape" && (
                <>
                  <div className="property-row">
                    {(
                      [
                        { kind: "rectangle", Icon: Square, label: "Rectangle" },
                        { kind: "ellipse", Icon: Circle, label: "Ellipse" },
                        {
                          kind: "note",
                          Icon: StickyNote,
                          label: "Sticky note",
                        },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.kind}
                        className={shape === s.kind ? "active" : ""}
                        title={s.label}
                        aria-label={s.label}
                        onClick={() => {
                          setShape(s.kind);
                          if (s.kind === "note") setFill(colors[0]);
                        }}
                      >
                        <s.Icon size={18} />
                      </button>
                    ))}
                  </div>
                  <span className="property-rule" />
                </>
              )}
              {(tool === "text" ||
                (active &&
                  ["text", "shape", "note"].includes(active.kind))) && (
                <div className="property-row">
                  <select
                    aria-label="Font size"
                    value={active?.fontSize || fontSize}
                    onChange={(e) => {
                      setFontSize(+e.target.value);
                      if (active) update({ fontSize: +e.target.value });
                    }}
                  >
                    {[14, 16, 20, 24, 32, 40, 48, 64, 96].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    aria-label="Bold"
                    className={(active?.bold ?? bold) ? "active" : ""}
                    onClick={() => {
                      setBold(!bold);
                      if (active) update({ bold: !active.bold });
                    }}
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    aria-label="Italic"
                    className={(active?.italic ?? italic) ? "active" : ""}
                    onClick={() => {
                      setItalic(!italic);
                      if (active) update({ italic: !active.italic });
                    }}
                  >
                    <Italic size={16} />
                  </button>
                  {(
                    [
                      { value: "left", Icon: AlignLeft },
                      { value: "center", Icon: AlignCenter },
                      { value: "right", Icon: AlignRight },
                    ] as const
                  ).map((a) => (
                    <button
                      aria-label={`Align ${a.value}`}
                      key={a.value}
                      onClick={() => {
                        setAlign(a.value);
                        if (active) update({ align: a.value });
                      }}
                    >
                      <a.Icon size={15} />
                    </button>
                  ))}
                </div>
              )}
              {(tool === "shape" ||
                (active && ["note", "shape"].includes(active.kind))) && (
                <div className="property-row swatches">
                  <button
                    className="no-color"
                    aria-label="No fill"
                    title="No fill"
                    onClick={() => {
                      setFill("transparent");
                      if (active) update({ color: "transparent" });
                    }}
                  />
                  {colors.map((c) => (
                    <button
                      key={c}
                      aria-label={`Fill ${c}`}
                      title={`Fill ${c}`}
                      className={
                        (active?.color || fill) === c
                          ? "swatch active"
                          : "swatch"
                      }
                      style={{ background: c }}
                      onClick={() => {
                        setFill(c);
                        if (active) update({ color: c });
                      }}
                    />
                  ))}
                </div>
              )}
              {(tool === "draw" ||
                tool === "connect" ||
                tool === "shape" ||
                tool === "text" ||
                active?.kind === "text" ||
                active?.kind === "drawing" ||
                active?.kind === "shape") && (
                <div className="property-row swatches">
                  {(tool === "shape" || active?.kind === "shape") && (
                    <button
                      className="no-color"
                      aria-label="No border"
                      title="No border"
                      onClick={() => {
                        setStroke("transparent");
                        if (active) update({ stroke: "transparent" });
                      }}
                    />
                  )}
                  {strokes.map((c) => (
                    <button
                      key={c}
                      className="swatch"
                      title={`Stroke ${c}`}
                      aria-label={`Stroke ${c}`}
                      style={{ background: c }}
                      onClick={() => {
                        setStroke(c);
                        if (active) update({ stroke: c });
                      }}
                    />
                  ))}
                  <span className="property-rule" />
                  {[1, 2, 4, 8].map((n) => (
                    <button
                      key={n}
                      title={`${n}px stroke`}
                      className={weight === n ? "active" : ""}
                      aria-label={`Stroke width ${n}`}
                      onClick={() => {
                        setWeight(n);
                        if (active) update({ strokeWidth: n });
                      }}
                    >
                      <span className="stroke-preview" style={{ height: n }} />
                    </button>
                  ))}
                </div>
              )}
              {selected.length > 0 && (
                <div className="property-row selection-actions">
                  <button
                    title="Duplicate (⌘D)"
                    aria-label="Duplicate selection"
                    onClick={duplicate}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    title="Bring to front"
                    aria-label="Bring to front"
                    onClick={() => moveLayer(true)}
                  >
                    <ArrowUpToLine size={16} />
                  </button>
                  <button
                    title="Send to back"
                    aria-label="Send to back"
                    onClick={() => moveLayer(false)}
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                  <button
                    title="Delete"
                    aria-label="Delete selection"
                    onClick={remove}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div
            className="toolbar"
            role="toolbar"
            aria-label="Canvas tools"
            data-ui
          >
            {toolButtons.map((t) => (
              <button
                key={t.id}
                className={effectiveTool === t.id ? "active" : ""}
                aria-label={t.label}
                aria-pressed={effectiveTool === t.id}
                title={`${t.label} (${t.key})${t.id === "hand" || t.id === "select" ? "" : ", double-click to lock"}`}
                onClick={() => chooseTool(t.id)}
                onDoubleClick={() => {
                  chooseTool(t.id);
                  if (t.id !== "hand" && t.id !== "select") setLocked(!locked);
                }}
              >
                <t.Icon size={19} />
                {locked && effectiveTool === t.id && t.id !== "hand" && t.id !== "select" && (
                  <LockKeyhole className="locked" size={8} />
                )}
              </button>
            ))}
          </div>
          <div className="zoom-controls" data-ui>
            <button
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => zoomAt(zoom / 1.2)}
            >
              −
            </button>
            <button
              title="Fit to content (⌘1)"
              aria-label="Fit to content"
              onClick={fit}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => zoomAt(zoom * 1.2)}
            >
              +
            </button>
          </div>
          {searchOpen && (
            <div className="find-bar" data-ui>
              <Search size={15} />
              <input
                autoFocus
                aria-label="Find on board"
                placeholder="Find on board…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    jump(searchIndex + (e.shiftKey ? -1 : 1));
                }}
              />
              <span>
                {search
                  ? `${Math.min(searchIndex + 1, results.length)} / ${results.length}`
                  : ""}
              </span>
              <button
                aria-label="Previous result"
                onClick={() => jump(searchIndex - 1)}
              >
                ↑
              </button>
              <button
                aria-label="Next result"
                onClick={() => jump(searchIndex + 1)}
              >
                ↓
              </button>
              <button
                aria-label="Close search"
                onClick={() => {
                  setSearchOpen(false);
                  setSearch("");
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
        </main>
      )}
      {menu && !gallery && (
        <>
          <div className="scrim" onClick={() => setMenu(false)} />
          <div className="file-menu" role="menu">
            <button role="menuitem" onClick={newBoard}>
              New board <kbd>⌘N</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                imports.current?.click();
              }}
            >
              Open .rtboard or HTML…
            </button>
            <button role="menuitem" onClick={() => void save("json")}>
              Save as .rtboard <kbd>⌘S</kbd>
            </button>
            <hr />
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setLinks("");
                setModal("links");
              }}
            >
              Import links…
              <small>Paste a list of links to add many items at once</small>
            </button>
            <button role="menuitem" onClick={() => void copyShare()}>
              Copy share link<small>Opens in browser, no download needed</small>
            </button>
            <button role="menuitem" onClick={() => void save("html")}>
              Export shareable .html
            </button>
            <button role="menuitem" onClick={() => void save("png")}>
              Export as PNG…
              <small>High-resolution image of the whole board</small>
            </button>
            <hr />
            <button role="menuitem" onClick={() => void setupBackup()}>
              {backup
                ? "Change auto-backup folder…"
                : "Set up auto-backup folder…"}
              <small>Save a copy every 10 minutes</small>
            </button>
            <hr />
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                files.current?.click();
              }}
            >
              Add images, video, or audio…
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setLinks("");
                setLinkTitle("");
                setModal("link");
              }}
            >
              Add a link…
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setSearchOpen(true);
                setMenu(false);
              }}
            >
              Find on board <kbd>⌘F</kbd>
            </button>
            <div className="menu-history">
              <button
                aria-label="Undo"
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 size={15} /> Undo
              </button>
              <button
                aria-label="Redo"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={15} /> Redo
              </button>
            </div>
          </div>
        </>
      )}
      {context && (
        <>
          <div className="scrim" onClick={() => setContext(null)} />
          <div
            className="context-menu"
            style={{ left: context.x, top: context.y }}
          >
            <button
              onClick={() => {
                addText(lastPointer.current || center());
                setContext(null);
              }}
            >
              <Type size={15} /> Add text
            </button>
            <button
              onClick={() => {
                addNote(lastPointer.current || center());
                setContext(null);
              }}
            >
              <StickyNote size={15} /> Add sticky note
            </button>
            <button
              onClick={() => {
                files.current?.click();
                setContext(null);
              }}
            >
              <ImagePlus size={15} /> Add media…
            </button>
            <button
              onClick={() => {
                setModal("link");
                setLinks("");
                setContext(null);
              }}
            >
              <Link2 size={15} /> Add link…
            </button>
            <hr />
            {selected.length > 0 && (
              <>
                <button
                  onClick={() => {
                    duplicate();
                    setContext(null);
                  }}
                >
                  <Copy size={15} /> Duplicate selection
                </button>
                <button
                  onClick={() => {
                    remove();
                    setContext(null);
                  }}
                >
                  <Trash2 size={15} /> Delete selection
                </button>
                <hr />
              </>
            )}
            <button
              onClick={() => {
                setSelectedConnection(null);
                setSelected(board.items.map((i) => i.id));
                setContext(null);
              }}
            >
              Select all <kbd>⌘A</kbd>
            </button>
            <button
              onClick={() => {
                fit();
                setContext(null);
              }}
            >
              Fit to content <kbd>⌘1</kbd>
            </button>
          </div>
        </>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) modal === "reconnect" ? closeReconnect() : setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "reconnect" ? "Reconnect endpoint" : modal === "help"
                ? "Keyboard shortcuts"
                : modal === "delete"
                  ? "Delete board"
                  : modal === "links"
                    ? "Import links"
                    : "Add a link"
            }
            onKeyDown={(e) => {
              if (modal !== "reconnect" || e.key !== "Tab") return;
              const controls = [...e.currentTarget.querySelectorAll<HTMLElement>("button,select")];
              const next = controls.indexOf(document.activeElement as HTMLElement) + (e.shiftKey ? -1 : 1);
              if (next < 0 || next >= controls.length) {
                e.preventDefault();
                controls[next < 0 ? controls.length - 1 : 0]?.focus();
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => modal === "reconnect" ? closeReconnect() : setModal(null)}
            >
              <X size={18} />
            </button>
            {modal === "reconnect" && reconnectDraft && (
              <form onSubmit={(e) => { e.preventDefault(); commitReconnect(); }}>
                <h2>Reconnect {reconnectDraft.endpoint === "from" ? "start" : "end"}</h2>
                <p>Choose an element, then apply. Press Escape to cancel.</p>
                <label htmlFor="attachment-target">Attach to element</label>
                <select id="attachment-target" autoFocus value={reconnectDraft.target}
                  onChange={(e) => setReconnectDraft({ ...reconnectDraft, target: e.target.value })}>
                  {reconnectDraft.arrow && <option value="">No attachment</option>}
                  {reconnectTargets.map((i, index) => <option key={i.id} value={i.id}>
                    {i.text.trim().slice(0, 60) || `${i.kind} ${index + 1}`}
                  </option>)}
                </select>
                <div className="dialog-actions">
                  <button type="button" onClick={closeReconnect}>Cancel</button>
                  <button type="submit" className="primary">Apply connection</button>
                </div>
              </form>
            )}
            {modal === "help" && (
              <>
                <h2>Keyboard shortcuts</h2>
                <div className="shortcut-grid">
                  {[
                    ["Select", "V"],
                    ["Hand", "H"],
                    ["Text", "T"],
                    ["Draw", "P / X"],
                    ["Rectangle", "R / 2"],
                    ["Ellipse", "O / 4"],
                    ["Constrain shape / movement", "Shift + drag"],
                    ["Duplicate while dragging", "Alt + drag"],
                    ["Connector", "C"],
                    ["Shapes", "S"],
                    ["Sticky note", "N"],
                    ["Pan from any tool", "Space + drag"],
                    ["Temporary Hand mode", "Middle mouse + drag"],
                    ["Select all", "⌘ / Ctrl A"],
                    ["Undo", "⌘ / Ctrl Z"],
                    ["Redo", "⇧ ⌘ / Ctrl Z"],
                    ["Duplicate", "⌘ / Ctrl D"],
                    ["Find on board", "⌘ / Ctrl F"],
                    ["Save board", "⌘ / Ctrl S"],
                    ["Back to 100%", "⌘ / Ctrl 0"],
                    ["Fit to content", "⌘ / Ctrl 1"],
                    ["Nudge selection", "Arrow keys"],
                    ["Nudge by 10", "Shift + arrows"],
                    ["Delete selection", "Delete / Backspace"],
                    ["Cancel / deselect", "Escape"],
                  ].map(([name, key]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
                <p>
                  Double-click empty canvas to add a sticky note.
                  Double-click a tool to keep it active. Double-click text to
                  edit. Drag on empty canvas to select multiple items.
                  Shift-click to add to a selection.
                </p>
              </>
            )}
            {(modal === "links" || modal === "link") && (
              <>
                <h2>{modal === "links" ? "Import links" : "Add a link"}</h2>
                <p>
                  YouTube, Instagram, TikTok, X, Vimeo, Spotify, Reddit, Loom,
                  and CodePen embed on the board. Playback depends on the
                  provider.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    importLinks(links);
                  }}
                >
                  <label>
                    {modal === "links" ? "Links, one per line" : "URL"}
                    <textarea
                      autoFocus
                      aria-label="Links"
                      required
                      rows={modal === "links" ? 7 : 3}
                      placeholder="https://…"
                      value={links}
                      onChange={(e) => setLinks(e.target.value)}
                    />
                  </label>
                  {modal === "link" && (
                    <label>
                      Title (optional)
                      <input
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                      />
                    </label>
                  )}
                  <button type="submit" className="primary">
                    {modal === "links" ? "Import links" : "Add to board"}
                  </button>
                </form>
              </>
            )}
            {modal === "delete" && (
              <>
                <h2>Delete board?</h2>
                <p>
                  This removes “
                  {workspace.boards.find((b) => b.id === deleteId)?.name}” from
                  this browser. Save a copy first if you want to keep it.
                </p>
                <div className="dialog-actions">
                  <button className="secondary" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setWorkspace((w) => ({
                        boards: w.boards.filter((b) => b.id !== deleteId),
                        active: w.active === deleteId ? "" : w.active,
                      }));
                      setModal(null);
                    }}
                  >
                    Delete board
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {(notice || busy) && (
        <div className="toast" role="status">
          {busy ? "Preparing export…" : notice}
        </div>
      )}
      <input
        ref={files}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void readFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={imports}
        type="file"
        accept=".rtboard,.json,.html"
        hidden
        onChange={(e) => {
          void loadFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
