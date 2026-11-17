import { bounds, type Item, type Point } from "./model";

export const framePadding = 32;
export const emptyFrameSize = { w: 960, h: 540 };

export function createFrame(items: Item[], id: string, title: string, at: Point): Item {
  const content = items.filter((i) => i.kind !== "frame");
  const box = content.length ? bounds(content) : {
    ...at, w: emptyFrameSize.w - framePadding * 2, h: emptyFrameSize.h - framePadding * 2,
  };
  const w = box.w + framePadding * 2, h = box.h + framePadding * 2;
  if (w > 20000 || h > 20000) {
    throw new Error("This selection is too large for one frame. Split it into smaller slides.");
  }
  return { id, kind: "frame", text: title, x: box.x - framePadding, y: box.y - framePadding, w, h };
}

export function frameContents(items: Item[], ids: string[]): string[] {
  const frames = items.filter((i) => i.kind === "frame" && ids.includes(i.id));
  return items.filter((i) => ids.includes(i.id) || (i.kind !== "frame" && frames.some((f) =>
    i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h,
  ))).map((i) => i.id);
}

export function slideCamera(frame: Item, width: number, height: number) {
  const zoom = Math.max(0.001, Math.min(Math.max(1, width - 64) / frame.w, Math.max(1, height - 140) / frame.h));
  return { zoom, offset: { x: (width - frame.w * zoom) / 2 - frame.x * zoom,
    y: (height - frame.h * zoom) / 2 - frame.y * zoom - 20 } };
}
