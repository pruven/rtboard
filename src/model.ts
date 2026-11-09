export type Kind = "note" | "text" | "image" | "link" | "drawing";
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
};
export type Connection = { id: string; from: string; to: string };
export type Board = {
  id: string;
  name: string;
  items: Item[];
  connections: Connection[];
  updated: number;
};
export type Workspace = { boards: Board[]; active: string };
export const uid = () => crypto.randomUUID();
export const colors = ["#f7e6a4", "#e5ecdc", "#f4d9cb", "#dbe8ee", "#f0e6db"];
export const imagePath = (name: string) => `/images/${name}.jpg`;
export function initialWorkspace(): Workspace {
  const board: Board = {
    id: uid(),
    name: "A slower kind of living",
    updated: Date.now(),
    connections: [],
    items: [
      {
        id: uid(),
        kind: "text",
        x: 75,
        y: 48,
        w: 560,
        h: 110,
        text: "A slower kind of living.\nA collection of spaces, textures & little rituals.",
      },
      {
        id: uid(),
        kind: "image",
        x: 75,
        y: 195,
        w: 292,
        h: 358,
        text: "Quiet mornings",
        src: imagePath("interior"),
      },
      {
        id: uid(),
        kind: "note",
        x: 405,
        y: 182,
        w: 257,
        h: 225,
        text: "Less, but better.\n\nNatural light.\nHonest materials.\nObjects with a story.",
        color: colors[0],
      },
      {
        id: uid(),
        kind: "image",
        x: 700,
        y: 90,
        w: 282,
        h: 298,
        text: "A moment of green",
        src: imagePath("olive"),
      },
      {
        id: uid(),
        kind: "image",
        x: 405,
        y: 448,
        w: 257,
        h: 222,
        text: "Everyday rituals",
        src: imagePath("coffee"),
      },
      {
        id: uid(),
        kind: "note",
        x: 711,
        y: 428,
        w: 252,
        h: 205,
        text: "Things to come back to\n\n☐ Warm, earthy tones\n☐ A little more green\n☐ Space to do nothing",
        color: colors[1],
      },
      {
        id: uid(),
        kind: "link",
        x: 75,
        y: 592,
        w: 292,
        h: 120,
        text: "The art of paying attention",
        src: "https://www.youtube.com/watch?v=ZXsQAXx_ao0",
      },
    ],
  };
  return { boards: [board], active: board.id };
}
export function safeUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function embedUrl(value: string): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  const u = new URL(url);
  if (u.hostname === "youtu.be")
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
  if (
    ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
  ) {
    const id =
      u.searchParams.get("v") ||
      u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/)?.[1];
    if (id)
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  }
  if (
    ["vimeo.com", "www.vimeo.com"].includes(u.hostname) &&
    /^\/\d+$/.test(u.pathname)
  )
    return `https://player.vimeo.com/video${u.pathname}`;
  if (
    u.hostname === "open.spotify.com" &&
    /^\/(track|album|playlist|episode)\/[a-zA-Z0-9]+/.test(u.pathname)
  )
    return `https://open.spotify.com/embed${u.pathname}`;
  return null;
}
export function validateBoard(input: unknown): Board {
  const b = input as Board;
  if (
    !b ||
    typeof b.name !== "string" ||
    !Array.isArray(b.items) ||
    b.items.length > 1000
  )
    throw new Error("This file is not an rtboard board.");
  const ids = new Set<string>();
  const items = b.items.map((i) => {
    if (
      !i ||
      !["note", "text", "image", "link", "drawing"].includes(i.kind) ||
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      typeof i.text !== "string" ||
      ![i.x, i.y, i.w, i.h].every(Number.isFinite) ||
      i.w < 20 ||
      i.h < 20 ||
      i.w > 10000 ||
      i.h > 10000
    )
      throw new Error("This board contains an invalid item.");
    ids.add(i.id);
    if (
      i.src &&
      (typeof i.src !== "string" ||
        !(
          safeUrl(i.src) ||
          (i.kind === "image" &&
            /^data:image\/(png|jpeg|gif|webp);base64,/.test(i.src)) ||
          /^\/images\/[a-z]+\.jpg$/.test(i.src)
        ))
    )
      throw new Error("This board contains an unsupported URL.");
    if (i.kind === "drawing" && !Array.isArray(i.points))
      throw new Error("Missing drawing data.");
    if (
      i.points &&
      (!Array.isArray(i.points) ||
        i.points.some(
          (p) =>
            !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite),
        ))
    )
      throw new Error("Invalid drawing data.");
    return {
      ...i,
      color: colors.includes(i.color || "") ? i.color : colors[0],
    };
  });
  const connections = (
    Array.isArray(b.connections) ? b.connections : []
  ).filter(
    (c) => c && typeof c.id === "string" && ids.has(c.from) && ids.has(c.to),
  );
  return {
    id: uid(),
    name: b.name.slice(0, 120),
    items,
    connections,
    updated: Date.now(),
  };
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function shareHtml(board: Board): string {
  const data = JSON.stringify(board).replace(/</g, "\\u003c");
  const embeds = JSON.stringify(
    Object.fromEntries(
      board.items
        .filter((i) => i.kind === "link")
        .map((i) => [i.id, embedUrl(i.src || "")]),
    ),
  ).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>rtboard collection</title><style>body{margin:0;background:#f5f3ef;font:16px system-ui;color:#34372e}header{padding:20px;border-bottom:1px solid #ddd}#viewport{position:absolute;inset:65px 0 0;overflow:auto}#canvas{position:relative;transform-origin:0 0}.item{position:absolute;box-sizing:border-box;white-space:pre-wrap;overflow:hidden;border-radius:6px}img,iframe{width:100%;height:100%;object-fit:cover;border:0}a{color:inherit}svg{overflow:visible}</style></head><body><header id="title"></header><div id="viewport"><div id="canvas"></div></div><script>const b=${data};const embeds=${embeds};document.getElementById('title').textContent=b.name+' · rtboard';const c=document.getElementById('canvas');const minX=Math.min(0,...b.items.map(i=>i.x))-30,minY=Math.min(0,...b.items.map(i=>i.y))-30;const maxX=Math.max(600,...b.items.map(i=>i.x+i.w))-minX,maxY=Math.max(500,...b.items.map(i=>i.y+i.h))-minY;c.style.width=maxX+'px';c.style.height=maxY+'px';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:absolute;width:100%;height:100%;pointer-events:none';b.connections.forEach(e=>{const a=b.items.find(i=>i.id===e.from),z=b.items.find(i=>i.id===e.to);if(!a||!z)return;const l=document.createElementNS(svg.namespaceURI,'line');Object.entries({x1:a.x+a.w/2-minX,y1:a.y+a.h/2-minY,x2:z.x+z.w/2-minX,y2:z.y+z.h/2-minY,stroke:'#7d8874','stroke-width':2}).forEach(([k,v])=>l.setAttribute(k,v));svg.append(l)});c.append(svg);b.items.forEach(i=>{const el=document.createElement('div');el.className='item';Object.assign(el.style,{left:i.x-minX+'px',top:i.y-minY+'px',width:i.w+'px',height:i.h+'px',background:i.kind==='note'?i.color:'transparent',padding:['note','text','link'].includes(i.kind)?'22px':'0'});if(i.kind==='image'){const img=document.createElement('img');img.src=i.src;img.alt=i.text;el.append(img)}else if(i.kind==='link'){const a=document.createElement('a');a.href=i.src;a.textContent=i.text+' ↗';a.target='_blank';a.rel='noopener';el.append(a);if(embeds[i.id]){const play=document.createElement('button');play.textContent='▶ Play here';play.style.cssText='display:block;margin-top:15px;padding:8px 12px;border:1px solid #ccc;border-radius:4px;cursor:pointer';play.onclick=()=>{const f=document.createElement('iframe');f.src=embeds[i.id];f.title=i.text;f.allow='autoplay; encrypted-media; fullscreen';f.allowFullscreen=true;el.style.padding='0';el.replaceChildren(f)};el.append(play)}}else if(i.kind==='drawing'){const s=document.createElementNS(svg.namespaceURI,'svg');s.setAttribute('viewBox','0 0 '+i.w+' '+i.h);const p=document.createElementNS(svg.namespaceURI,'polyline');p.setAttribute('points',i.points.map(p=>p.join(',')).join(' '));p.setAttribute('fill','none');p.setAttribute('stroke','#59684e');p.setAttribute('stroke-width','3');s.append(p);el.append(s)}else el.textContent=i.text;c.append(el)});document.getElementById('viewport').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const z=Math.max(.2,Math.min(2,+(c.dataset.zoom||1)-e.deltaY*.001));c.dataset.zoom=z;c.style.transform='scale('+z+')'}},{passive:false});</script></body></html>`;
}
