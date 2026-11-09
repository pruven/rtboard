import { useState, useEffect, useRef, useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Expand,
  FilePlus2,
  FolderOpen,
  Hand,
  HelpCircle,
  ImagePlus,
  Link2,
  Menu,
  Minus,
  MoreHorizontal,
  MousePointer2,
  MoveUpRight,
  PanelLeftClose,
  PenLine,
  Plus,
  Redo2,
  Search,
  Settings2,
  StickyNote,
  Sun,
  Moon,
  Trash2,
  Type,
  Undo2,
  X,
  Play,
  LayoutGrid,
} from "lucide-react";
import {
  type Board,
  type Workspace,
  type Item,
  uid,
  colors,
  initialWorkspace,
  safeUrl,
  embedUrl,
  validateBoard,
  download,
  shareHtml,
} from "./model";
type Tool = "select" | "hand" | "note" | "text" | "draw" | "connect";
type Modal = "link" | "export" | "help" | "new" | null;
const storageKey = "rtboard.workspace.v1";
function load(): Workspace {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const w = JSON.parse(raw);
      if (w.boards?.length && w.boards.some((b: Board) => b.id === w.active)) {
        return {
          active: w.active,
          boards: w.boards.map((b: Board) => ({
            ...validateBoard(b),
            id: b.id,
          })),
        };
      }
    }
  } catch {}
  return initialWorkspace();
}
function App() {
  const [workspace, setWorkspace] = useState<Workspace>(load);
  const board = workspace.boards.find((b) => b.id === workspace.active)!;
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760);
  const [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [saveState, setSaveState] = useState("Saved locally");
  const [dark, setDark] = useState(
    () => localStorage.getItem("rtboard.theme") === "dark",
  );
  const [menu, setMenu] = useState(false);
  const [link, setLink] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [boardName, setBoardName] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [draft, setDraft] = useState<number[][]>([]);
  const [history, setHistory] = useState<Board[]>([]);
  const [future, setFuture] = useState<Board[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const current = useRef(board);
  current.current = board;
  const gesture = useRef<{
    kind: "pan" | "drag" | "draw" | "resize";
    x: number;
    y: number;
    ox: number;
    oy: number;
    id?: string;
    before?: Board;
    points?: number[][];
  } | null>(null);
  const notice = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setSaveState("Saving…");
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(workspace));
        setSaveState("Saved locally");
      } catch {
        setSaveState("Storage full");
        notice("Browser storage is full. Export your board to keep a copy.");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [workspace, notice]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("rtboard.theme", dark ? "dark" : "light");
  }, [dark]);
  const change = (next: Board, record = true) => {
    if (record) {
      setHistory((h) => [...h.slice(-49), current.current]);
      setFuture([]);
    }
    setWorkspace((w) => ({
      ...w,
      boards: w.boards.map((b) =>
        b.id === next.id ? { ...next, updated: Date.now() } : b,
      ),
    }));
  };
  const patch = (id: string, data: Partial<Item>, record = true) =>
    change(
      {
        ...current.current,
        items: current.current.items.map((i) =>
          i.id === id ? { ...i, ...data } : i,
        ),
      },
      record,
    );
  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [current.current, ...f]);
    setHistory((h) => h.slice(0, -1));
    change(prev, false);
    setSelected(null);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, current.current]);
    change(future[0], false);
    setFuture((f) => f.slice(1));
    setSelected(null);
  };
  const remove = () => {
    if (!selected) return;
    change({
      ...board,
      items: board.items.filter((i) => i.id !== selected),
      connections: board.connections.filter(
        (c) => c.from !== selected && c.to !== selected,
      ),
    });
    setSelected(null);
  };
  const point = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - offset.x) / zoom,
      y: (clientY - r.top - offset.y) / zoom,
    };
  };
  const add = (
    kind: Item["kind"],
    data: Partial<Item> = {},
    at?: { x: number; y: number },
  ) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const p = at || {
      x: ((r?.width || 800) / 2 - offset.x) / zoom - 125,
      y: ((r?.height || 600) / 2 - offset.y) / zoom - 100,
    };
    const item: Item = {
      id: uid(),
      kind,
      x: p.x,
      y: p.y,
      w: kind === "text" ? 360 : 260,
      h: kind === "text" ? 100 : kind === "link" ? 140 : 230,
      text:
        kind === "note"
          ? "A little thought…"
          : kind === "text"
            ? "Give your idea some room."
            : "",
      color: colors[0],
      ...data,
    };
    item.id = uid();
    change({ ...current.current, items: [...current.current.items, item] });
    setSelected(item.id);
    setTool("select");
    if (kind === "note" || kind === "text") setEditing(item.id);
    return item.id;
  };
  const resetView = () => {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  };
  const switchBoard = (id: string) => {
    setWorkspace((w) => ({ ...w, active: id }));
    setSelected(null);
    setEditing(null);
    setHistory([]);
    setFuture([]);
    setPlaying(null);
    setSearch("");
    resetView();
  };
  const fit = () => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !board.items.length) {
      resetView();
      return;
    }
    const minX = Math.min(...board.items.map((i) => i.x)) - 55,
      minY = Math.min(...board.items.map((i) => i.y)) - 55,
      maxX = Math.max(...board.items.map((i) => i.x + i.w)) + 55,
      maxY = Math.max(...board.items.map((i) => i.y + i.h)) + 100;
    const z = Math.min(1.5, r.width / (maxX - minX), r.height / (maxY - minY));
    setZoom(z);
    setOffset({
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: (r.height - (maxY - minY) * z) / 2 - minY * z,
    });
  };
  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const z = Math.max(0.15, Math.min(3, next));
    const x = cx ?? (r?.width || 800) / 2,
      y = cy ?? (r?.height || 600) / 2;
    setOffset((o) => ({
      x: x - ((x - o.x) * z) / zoom,
      y: y - ((y - o.y) * z) / zoom,
    }));
    setZoom(z);
  };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("textarea,iframe")) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(
          zoom * Math.exp(-e.deltaY * 0.008),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else setOffset((o) => ({ x: o.x - e.deltaX, y: o.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setEditing(null);
        setModal(null);
        setMenu(false);
        setConnecting(null);
        setTool("select");
        setSearchOpen(false);
        setSearch("");
        return;
      }
      if (modal) return;
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]"))
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "f" || e.key === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key === "s") {
        e.preventDefault();
        download(board.name + ".rtboard", JSON.stringify(board));
        notice("Board downloaded");
      } else if (mod && e.key === "d" && selected) {
        e.preventDefault();
        const i = board.items.find((i) => i.id === selected)!;
        add(i.kind, { ...i, id: undefined, x: i.x + 24, y: i.y + 24 });
      } else if (e.key === "Escape") {
        setSelected(null);
        setEditing(null);
        setModal(null);
        setMenu(false);
        setConnecting(null);
        setTool("select");
        setSearchOpen(false);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (!mod) {
        const tools: Record<string, Tool> = {
          v: "select",
          h: "hand",
          n: "note",
          t: "text",
          p: "draw",
          a: "connect",
        };
        if (tools[e.key]) setTool(tools[e.key]);
        if (e.key === "0") fit();
        if (e.key === "?") setModal("help");
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });
  const readImages = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
        notice("Choose a PNG, JPG, WebP, or GIF image.");
        continue;
      }
      if (file.size > 3 * 1024 * 1024) {
        notice("Please choose an image smaller than 3 MB.");
        continue;
      }
      try {
        const src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const size = await new Promise<{ w: number; h: number }>(
          (resolve, reject) => {
            const img = new Image();
            img.onload = () =>
              resolve({
                w: 300,
                h: Math.min(650, (300 * img.naturalHeight) / img.naturalWidth),
              });
            img.onerror = reject;
            img.src = src;
          },
        );
        add("image", { src, text: file.name, ...size });
      } catch {
        notice("This image could not be opened.");
      }
    }
  };
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]"))
        return;
      if (e.clipboardData?.files.length) {
        e.preventDefault();
        void readImages(e.clipboardData.files);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        e.preventDefault();
        if (safeUrl(text))
          add("link", { src: safeUrl(text)!, text: new URL(text).hostname });
        else add("note", { text });
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });
  const canvasDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest(".board-item")) return;
    if ((e.target as HTMLElement).closest("button,input")) return;
    const p = point(e.clientX, e.clientY);
    setEditing(null);
    setSelected(null);
    if (tool === "note" || tool === "text") {
      add(tool, {}, p);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw") {
      gesture.current = {
        kind: "draw",
        x: p.x,
        y: p.y,
        ox: 0,
        oy: 0,
        points: [[p.x, p.y]],
      };
      setDraft([[p.x, p.y]]);
    } else
      gesture.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
  };
  const itemDown = (e: ReactPointerEvent, item: Item) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("textarea,button,a,iframe")) return;
    if (tool === "hand") {
      e.stopPropagation();
      canvasRef.current?.setPointerCapture(e.pointerId);
      gesture.current = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        ox: offset.x,
        oy: offset.y,
      };
      return;
    }
    if (tool === "connect") {
      e.stopPropagation();
      if (connecting && connecting !== item.id) {
        change({
          ...board,
          connections: [
            ...board.connections,
            { id: uid(), from: connecting, to: item.id },
          ],
        });
        setConnecting(null);
        setTool("select");
      } else {
        setConnecting(item.id);
        notice("Now select another card to connect.");
      }
      return;
    }
    if (tool === "draw") return;
    e.stopPropagation();
    setSelected(item.id);
    setEditing(null);
    canvasRef.current?.setPointerCapture(e.pointerId);
    gesture.current = {
      kind: "drag",
      id: item.id,
      x: e.clientX,
      y: e.clientY,
      ox: item.x,
      oy: item.y,
      before: board,
    };
  };
  const move = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan")
      setOffset({ x: g.ox + e.clientX - g.x, y: g.oy + e.clientY - g.y });
    if (g.kind === "drag")
      patch(
        g.id!,
        {
          x: g.ox + (e.clientX - g.x) / zoom,
          y: g.oy + (e.clientY - g.y) / zoom,
        },
        false,
      );
    if (g.kind === "resize")
      patch(
        g.id!,
        {
          w: Math.max(120, g.ox + (e.clientX - g.x) / zoom),
          h: Math.max(80, g.oy + (e.clientY - g.y) / zoom),
        },
        false,
      );
    if (g.kind === "draw") {
      const p = point(e.clientX, e.clientY);
      g.points!.push([p.x, p.y]);
      setDraft([...g.points!]);
    }
  };
  const up = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.kind === "draw" && g.points!.length > 2) {
      const xs = g.points!.map((p) => p[0]),
        ys = g.points!.map((p) => p[1]);
      const x = Math.min(...xs) - 5,
        y = Math.min(...ys) - 5;
      add("drawing", {
        x,
        y,
        w: Math.max(20, Math.max(...xs) - x + 5),
        h: Math.max(20, Math.max(...ys) - y + 5),
        points: g.points!.map((p) => [p[0] - x, p[1] - y]),
      });
      setTool("draw");
    }
    if ((g.kind === "drag" || g.kind === "resize") && g.before) {
      setHistory((h) => [...h.slice(-49), g.before!]);
      setFuture([]);
    }
    setDraft([]);
  };
  const rename = (name: string) => {
    const next = name.trim() || "Untitled board";
    if (next !== board.name) change({ ...board, name: next });
  };
  const createBoard = () => {
    const b: Board = {
      id: uid(),
      name: boardName.trim() || "Untitled board",
      items: [],
      connections: [],
      updated: Date.now(),
    };
    setWorkspace((w) => ({ boards: [...w.boards, b], active: b.id }));
    setBoardName("");
    setModal(null);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    resetView();
  };
  const importBoard = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024)
        throw new Error("This file is too large.");
      const b = validateBoard(JSON.parse(await file.text()));
      setWorkspace((w) => ({ boards: [...w.boards, b], active: b.id }));
      setHistory([]);
      setFuture([]);
      setSelected(null);
      resetView();
      notice("Board imported");
    } catch (e) {
      notice(e instanceof Error ? e.message : "Could not import this file.");
    }
  };
  const exportBoard = async (type: "json" | "html") => {
    let exported = board;
    {
      try {
        exported = {
          ...board,
          items: await Promise.all(
            board.items.map(async (i) => {
              if (i.kind !== "image" || !i.src?.startsWith("/")) return i;
              const response = await fetch(i.src);
              if (!response.ok) throw new Error("Image unavailable");
              const blob = await response.blob();
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
      } catch {
        notice("Could not package images. Please try again.");
        return;
      }
    }
    download(
      board.name + (type === "html" ? ".html" : ".rtboard"),
      type === "html" ? shareHtml(exported) : JSON.stringify(exported),
      type === "html" ? "text/html" : "application/json",
    );
    notice(
      type === "html"
        ? "Shareable board downloaded"
        : "Editable board downloaded",
    );
    setModal(null);
  };
  useEffect(() => {
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [board.id, sidebar]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>("button,input,a[href]") || [],
      );
    const first = dialog?.querySelector<HTMLElement>("input") || focusable()[0];
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusable();
      const index = els.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && index === 0) {
        e.preventDefault();
        els.at(-1)?.focus();
      } else if (!e.shiftKey && index === els.length - 1) {
        e.preventDefault();
        els[0]?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal]);
  const selectedItem = board.items.find((i) => i.id === selected);
  const results = board.items.filter((i) =>
    i.text.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className={`app ${sidebar ? "" : "collapsed"}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="rtboard home">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          rtboard
        </a>
        <button className="workspace-switch" onClick={() => setMenu(!menu)}>
          <span className="workspace-avatar">M</span>
          <span>
            My workspace<small>Just for you</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="sidebar-label">WORKSPACE</div>
        <button
          className="nav-button"
          onClick={() => {
            setSearchOpen(true);
            setSearch("");
          }}
        >
          <Search size={17} /> Search this board <kbd>⌘ K</kbd>
        </button>
        <button
          className="nav-button active"
          onClick={() => {
            setSearchOpen(false);
            setSearch("");
          }}
        >
          <LayoutGrid size={17} /> All boards{" "}
          <span className="count">{workspace.boards.length}</span>
        </button>
        <div className="sidebar-label boards-label">
          YOUR BOARDS
          <button title="Create board" onClick={() => setModal("new")}>
            <Plus size={15} />
          </button>
        </div>
        <div className="board-list">
          {workspace.boards.map((b, i) => (
            <button
              key={b.id}
              className={`board-nav ${b.id === board.id ? "current" : ""}`}
              onClick={() => switchBoard(b.id)}
            >
              <span className={`board-swatch swatch-${i % 3}`}>
                <LayoutGrid size={14} />
              </span>
              <span>{b.name}</span>
              {b.id === board.id && <span className="current-dot" />}
            </button>
          ))}
        </div>
        <button className="new-board" onClick={() => setModal("new")}>
          <Plus size={17} /> New board
        </button>
        <div className="sidebar-bottom">
          <div className="private-note">
            <span className="private-icon">
              <CheckCheck size={18} />
            </span>
            <strong>A little space of your own.</strong>
            <p>
              Your boards stay in this browser.
              <br />
              No accounts. No distractions.
            </p>
            <span className="tiny-line" />
          </div>
          <button className="nav-button" onClick={() => setDark(!dark)}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
            {dark ? "Light appearance" : "Dark appearance"}
          </button>
          <button className="nav-button" onClick={() => setModal("help")}>
            <HelpCircle size={17} /> A little help <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-footer">
            <span>Made for your train of thought.</span>
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button sidebar-toggle"
            title="Toggle sidebar"
            onClick={() => setSidebar(!sidebar)}
          >
            {sidebar ? <PanelLeftClose size={18} /> : <Menu size={18} />}
          </button>
          <div className="breadcrumb">
            <span>My boards</span>
            <ChevronRight size={14} />
            <input
              aria-label="Board name"
              key={board.id}
              defaultValue={board.name}
              onBlur={(e) => rename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </div>
          <div className="top-actions">
            <span
              className={`saved ${saveState === "Storage full" ? "error" : ""}`}
            >
              <span />
              {saveState}
            </span>
            <button
              className="icon-button"
              title="Board options"
              onClick={() => setMenu(!menu)}
            >
              <MoreHorizontal size={20} />
            </button>
            <button
              className="export-button"
              onClick={() => setModal("export")}
            >
              <ArrowUpRight size={16} /> Export board
            </button>
          </div>
        </header>
        <div className="board-header">
          <div>
            <span className="eyebrow">
              <span /> YOUR CREATIVE CORNER
            </span>
            <h1>{board.name}</h1>
            <p>A place for the things that catch your eye.</p>
          </div>
          <div className="board-meta">
            <span className="mini-avatar">M</span>
            <div>
              Only you<small>{board.items.length} things collected</small>
            </div>
            <button
              className="icon-button"
              title="Board help"
              onClick={() => setModal("help")}
            >
              <HelpCircle size={18} />
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          className={`canvas tool-${tool}`}
          onPointerDown={canvasDown}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void readImages(e.dataTransfer.files);
          }}
          style={{
            backgroundPosition: `${offset.x}px ${offset.y}px`,
            backgroundSize: `${Math.max(18, 24 * zoom)}px ${Math.max(18, 24 * zoom)}px`,
          }}
        >
          <div
            className="canvas-world"
            style={{
              transform: `translate(${offset.x}px,${offset.y}px) scale(${zoom})`,
            }}
          >
            <svg className="connections">
              {board.connections.map((c) => {
                const a = board.items.find((i) => i.id === c.from),
                  b = board.items.find((i) => i.id === c.to);
                if (!a || !b) return null;
                return (
                  <g
                    key={c.id}
                    className="connection"
                    onDoubleClick={() =>
                      change({
                        ...board,
                        connections: board.connections.filter(
                          (x) => x.id !== c.id,
                        ),
                      })
                    }
                  >
                    <path
                      d={`M${a.x + a.w / 2},${a.y + a.h / 2} C${a.x + a.w + 70},${a.y + a.h / 2} ${b.x - 70},${b.y + b.h / 2} ${b.x + b.w / 2},${b.y + b.h / 2}`}
                    />
                  </g>
                );
              })}
              {draft.length > 0 && (
                <polyline
                  points={draft.map((p) => p.join(",")).join(" ")}
                  className="draft"
                />
              )}
            </svg>
            {board.items.map((item) => (
              <div
                key={item.id}
                className={`board-item item-${item.kind} ${selected === item.id ? "selected" : ""} ${connecting === item.id ? "connecting" : ""} ${search && !item.text.toLowerCase().includes(search.toLowerCase()) ? "dimmed" : ""}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.w,
                  height: item.h,
                  ...(item.kind === "note" ? { background: item.color } : {}),
                  zIndex: selected === item.id ? 5 : 1,
                }}
                onPointerDown={(e) => itemDown(e, item)}
                onDoubleClick={() => {
                  if (["note", "text"].includes(item.kind)) {
                    setEditing(item.id);
                    setSelected(item.id);
                  }
                }}
              >
                {item.kind === "image" && (
                  <img src={item.src} alt={item.text} draggable={false} />
                )}
                {(item.kind === "note" || item.kind === "text") &&
                  (editing === item.id ? (
                    <textarea
                      autoFocus
                      aria-label="Edit card text"
                      value={item.text}
                      onChange={(e) =>
                        patch(item.id, { text: e.target.value }, false)
                      }
                      onFocus={() => {
                        setHistory((h) => [...h, board]);
                        setFuture([]);
                      }}
                      onBlur={() => setEditing(null)}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="card-text">{item.text}</div>
                  ))}
                {item.kind === "note" && <div className="note-fold" />}
                {item.kind === "drawing" && (
                  <svg viewBox={`0 0 ${item.w} ${item.h}`}>
                    <polyline
                      points={item.points?.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {item.kind === "link" &&
                  (playing === item.id && embedUrl(item.src || "") ? (
                    <iframe
                      title={item.text}
                      src={embedUrl(item.src || "")!}
                      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="link-card">
                      <div className="link-top">
                        <span className="link-site">
                          <Link2 size={14} />
                          {item.src
                            ? new URL(item.src).hostname.replace("www.", "")
                            : ""}
                        </span>
                        <ArrowUpRight size={15} />
                      </div>
                      <strong>{item.text}</strong>
                      <div className="link-bottom">
                        {embedUrl(item.src || "") ? (
                          <button onClick={() => setPlaying(item.id)}>
                            <Play size={12} fill="currentColor" /> Play here
                          </button>
                        ) : (
                          <a href={item.src} target="_blank" rel="noreferrer">
                            Open link <ArrowUpRight size={13} />
                          </a>
                        )}
                        <span>Saved inspiration</span>
                      </div>
                    </div>
                  ))}
                {selected === item.id && (
                  <button
                    className="resize-handle"
                    title="Drag to resize"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      canvasRef.current?.setPointerCapture(e.pointerId);
                      gesture.current = {
                        kind: "resize",
                        id: item.id,
                        x: e.clientX,
                        y: e.clientY,
                        ox: item.w,
                        oy: item.h,
                        before: board,
                      };
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {board.items.length === 0 && (
            <div className="empty-board">
              <span className="empty-icon">
                <StickyNote size={30} />
              </span>
              <h2>A fresh page for your ideas.</h2>
              <p>
                Add a note, drop an image, or paste a link.
                <br />
                There’s room for all of it.
              </p>
              <button onClick={() => add("note")}>
                <Plus size={16} /> Add your first note
              </button>
            </div>
          )}
          <div className="canvas-tag">
            <span /> Personal board <span className="tag-separator">/</span>{" "}
            Everything starts with a little curiosity.
          </div>
          <div className="toolbar" role="toolbar" aria-label="Canvas tools">
            {(
              [
                {
                  id: "select",
                  icon: MousePointer2,
                  label: "Select",
                  key: "V",
                },
                { id: "hand", icon: Hand, label: "Pan", key: "H" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "chosen" : ""}
                title={`${t.label} (${t.key})`}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
              >
                <t.icon size={20} />
              </button>
            ))}
            <i />
            {(
              [
                {
                  id: "note",
                  icon: StickyNote,
                  label: "Sticky note",
                  key: "N",
                },
                { id: "text", icon: Type, label: "Text", key: "T" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={tool === t.id ? "chosen" : ""}
                title={`${t.label} (${t.key})`}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}
              >
                <t.icon size={20} />
              </button>
            ))}
            <button
              title="Upload image"
              aria-label="Upload image"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={20} />
            </button>
            <button
              title="Add link"
              aria-label="Add link"
              onClick={() => {
                setLink("");
                setLinkTitle("");
                setModal("link");
              }}
            >
              <Link2 size={20} />
            </button>
            <i />
            <button
              className={tool === "draw" ? "chosen" : ""}
              aria-label="Draw"
              title="Draw (P)"
              onClick={() => setTool("draw")}
            >
              <PenLine size={20} />
            </button>
            <button
              className={tool === "connect" ? "chosen" : ""}
              aria-label="Connect cards"
              title="Connect cards (A)"
              onClick={() => {
                setTool("connect");
                setConnecting(null);
                notice("Select two cards to connect them.");
              }}
            >
              <MoveUpRight size={20} />
            </button>
          </div>
          {selectedItem && (
            <div
              className="selection-tools"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {selectedItem.kind === "note" &&
                colors.map((color) => (
                  <button
                    key={color}
                    aria-label={`Set note color ${color}`}
                    className="color-button"
                    style={{ background: color }}
                    onClick={() => patch(selected!, { color })}
                  >
                    {selectedItem.color === color && <Check size={12} />}
                  </button>
                ))}
              {["note", "text"].includes(selectedItem.kind) && (
                <button title="Edit text" onClick={() => setEditing(selected)}>
                  <Type size={16} />
                </button>
              )}
              <button
                title="Duplicate card"
                onClick={() => {
                  const { id, ...i } = selectedItem;
                  add(i.kind, { ...i, x: i.x + 24, y: i.y + 24 });
                }}
              >
                <Copy size={16} />
              </button>
              <button title="Delete card" onClick={remove}>
                <Trash2 size={16} />
              </button>
            </div>
          )}
          <div className="canvas-bottom">
            <span className="canvas-hint">
              {tool === "draw" ? (
                "Draw anywhere on the canvas"
              ) : tool === "note" || tool === "text" ? (
                "Click anywhere to place your idea"
              ) : tool === "connect" ? (
                "Select two cards to connect"
              ) : (
                <>
                  <Hand size={13} /> Drag the canvas to look around{" "}
                  <span>·</span> Scroll to pan
                </>
              )}
            </span>
            <div className="view-controls">
              <button
                aria-label="Undo"
                title="Undo (⌘ Z)"
                onClick={undo}
                disabled={!history.length}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="Redo"
                title="Redo (⌘ Shift Z)"
                onClick={redo}
                disabled={!future.length}
              >
                <Redo2 size={17} />
              </button>
              <i />
              <button aria-label="Zoom out" onClick={() => zoomAt(zoom / 1.2)}>
                <Minus size={16} />
              </button>
              <button
                className="zoom-label"
                onClick={resetView}
                title="Reset view"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button aria-label="Zoom in" onClick={() => zoomAt(zoom * 1.2)}>
                <Plus size={16} />
              </button>
              <i />
              <button
                aria-label="Fit board"
                title="Fit board (0)"
                onClick={fit}
              >
                <Expand size={17} />
              </button>
            </div>
          </div>
        </div>
      </main>
      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="dropdown">
            <button
              onClick={() => {
                setModal("new");
                setMenu(false);
              }}
            >
              <FilePlus2 size={16} /> Create board
            </button>
            <button
              onClick={() => {
                importRef.current?.click();
                setMenu(false);
              }}
            >
              <FolderOpen size={16} /> Import board
            </button>
            <button
              onClick={() => {
                setModal("export");
                setMenu(false);
              }}
            >
              <Download size={16} /> Export board
            </button>
            <hr />
            <button
              onClick={() => {
                const b = { ...board, id: uid(), name: board.name + " (copy)" };
                setWorkspace((w) => ({
                  boards: [...w.boards, b],
                  active: b.id,
                }));
                setHistory([]);
                setFuture([]);
                setSelected(null);
                setMenu(false);
              }}
            >
              <Copy size={16} /> Duplicate board
            </button>
            <button
              onClick={() => {
                setDark(!dark);
                setMenu(false);
              }}
            >
              <Settings2 size={16} /> Switch appearance
            </button>
          </div>
        </>
      )}
      {searchOpen && (
        <div className="search-panel">
          <div className="search-field">
            <Search size={18} />
            <input
              autoFocus
              placeholder="Find something on this board…"
              aria-label="Search board"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                setSearch("");
              }}
            >
              <X size={17} />
            </button>
          </div>
          <div className="search-results">
            {search ? (
              results.length ? (
                results.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setSelected(i.id);
                      const r = canvasRef.current!.getBoundingClientRect();
                      setOffset({
                        x: r.width / 2 - (i.x + i.w / 2) * zoom,
                        y: r.height / 2 - (i.y + i.h / 2) * zoom,
                      });
                      setSearchOpen(false);
                      setSearch("");
                    }}
                  >
                    <span>
                      {i.kind === "image" ? (
                        <ImagePlus size={16} />
                      ) : (
                        <StickyNote size={16} />
                      )}
                    </span>
                    <span>{i.text || "Untitled " + i.kind}</span>
                    <ArrowRight size={15} />
                  </button>
                ))
              ) : (
                <p>No matches. Try another word.</p>
              )
            ) : (
              <p>Search notes, titles, and image names on this board.</p>
            )}
          </div>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "export"
                ? "Export board"
                : modal === "link"
                  ? "Add a link"
                  : modal === "new"
                    ? "Create board"
                    : "A little help"
            }
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            {modal === "new" && (
              <>
                <span className="modal-symbol">
                  <LayoutGrid size={25} />
                </span>
                <h2>A little room for something new.</h2>
                <p>Give your board a name. You can change it anytime.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createBoard();
                  }}
                >
                  <label>
                    Board name
                    <input
                      autoFocus
                      value={boardName}
                      onChange={(e) => setBoardName(e.target.value)}
                      placeholder="A new collection"
                      maxLength={120}
                    />
                  </label>
                  <button className="primary" type="submit">
                    Create board <ArrowRight size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === "link" && (
              <>
                <span className="modal-symbol">
                  <Link2 size={25} />
                </span>
                <h2>Keep a good find.</h2>
                <p>
                  YouTube, Vimeo, and Spotify play right on your board. Other
                  links are saved as bookmarks.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const url = safeUrl(link);
                    if (!url) {
                      notice("Enter a complete http:// or https:// link.");
                      return;
                    }
                    add("link", {
                      src: url,
                      text: linkTitle.trim() || new URL(url).hostname,
                      w: 300,
                      h: embedUrl(url) ? 200 : 140,
                    });
                    setModal(null);
                  }}
                >
                  <label>
                    Link
                    <input
                      type="url"
                      autoFocus
                      required
                      placeholder="https://"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                    />
                  </label>
                  <label>
                    Title <span>optional</span>
                    <input
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      placeholder="What caught your eye?"
                    />
                  </label>
                  <button type="submit" className="primary">
                    Add to board <Plus size={16} />
                  </button>
                </form>
              </>
            )}
            {modal === "export" && (
              <>
                <span className="modal-symbol">
                  <ArrowDownToLine size={25} />
                </span>
                <h2>A collection worth keeping.</h2>
                <p>
                  Save an editable copy, or take your board with you as a single
                  web page.
                </p>
                <button
                  className="export-option"
                  onClick={() => void exportBoard("json")}
                >
                  <span>
                    <Download size={21} />
                  </span>
                  <div>
                    <strong>Save editable board</strong>
                    <small>
                      A .rtboard file you can import and edit later.
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </button>
                <button
                  className="export-option"
                  onClick={() => void exportBoard("html")}
                >
                  <span>
                    <ArrowUpRight size={21} />
                  </span>
                  <div>
                    <strong>Export shareable HTML</strong>
                    <small>
                      Includes images and links. Opens in any browser.
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </button>
                <div className="export-foot">
                  <Check size={14} /> Your original stays right here.
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="modal-symbol">
                  <HelpCircle size={25} />
                </span>
                <h2>Make yourself at home.</h2>
                <p>
                  Collect your thoughts. Move things around. Make a little mess.
                </p>
                <div className="shortcuts">
                  {[
                    ["Select / move cards", "V"],
                    ["Pan the canvas", "H"],
                    ["Add a sticky note", "N"],
                    ["Add text", "T"],
                    ["Draw freely", "P"],
                    ["Connect two cards", "A"],
                    ["Fit everything in view", "0"],
                    ["Search this board", "⌘ / Ctrl F"],
                    ["Undo", "⌘ / Ctrl Z"],
                    ["Save an editable copy", "⌘ / Ctrl S"],
                  ].map(([label, key]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <kbd>{key}</kbd>
                    </div>
                  ))}
                </div>
                <p className="help-foot">
                  Double-click a note to edit it. Paste text, links, or images
                  directly onto the canvas. Pinch to zoom. Double-click a
                  connection to remove it. Boards are stored in this browser;
                  export a copy before clearing browser data.
                </p>
                <div className="credits">
                  Starter photographs via{" "}
                  <a
                    href="https://unsplash.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Unsplash
                  </a>
                  .
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void readImages(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={importRef}
        type="file"
        accept=".rtboard,.json,application/json"
        hidden
        onChange={(e) => {
          void importBoard(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
export default App;
