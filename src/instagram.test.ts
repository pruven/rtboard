// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { instagramEmbedDocument, instagramPermalink, instagramSandbox } from "./instagram";
import { createBoard, embedUrl, linkItem, parseBoardFile } from "./model";
import { shareHtml } from "./viewer";

describe("Instagram players", () => {
  it.each(["MOUNTED", "MEASURE"])("keeps a player ready after a trusted %s message, including in a sandbox", async (type) => {
    const player = new Window({ settings: {
      enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true, suppressInsecureJavaScriptEnvironmentWarning: true,
    } });
    const timer = vi.spyOn(player, "setTimeout").mockReturnValue(1 as never);
    const clear = vi.spyOn(player, "clearTimeout");
    try {
      player.document.write(instagramEmbedDocument("https://instagram.com/p/ABC/")!);
      const frame = player.document.createElement("iframe");
      frame.srcdoc = " ";
      player.document.body.append(frame);
      const send = (origin: string, source: unknown, data: unknown) => player.dispatchEvent(new player.MessageEvent("message", {
        origin, source: source as never, data,
      }));
      const data = JSON.stringify({ type, details: type === "MEASURE" ? { height: 512 } : { styles: [["height", "512px"]] } });
      send("null", player, data); // Opaque origin alone is insufficient.
      send("https://example.com", frame.contentWindow, data);
      send("https://www.instagram.com", frame.contentWindow, "not JSON");
      send("null", frame.contentWindow, JSON.stringify({ type: "LOADING" }));
      expect(player.document.body.className).not.toBe("ready");
      send("null", frame.contentWindow, data);
      expect(player.document.body.className).toBe("ready");
      expect(frame.style.height).toBe("512px");
      expect(clear).toHaveBeenCalledWith(1);
      // A timeout or late script error must not hide an already rendered post.
      (timer.mock.calls.find((call) => call[1] === 15000)![0] as () => void)();
      player.document.querySelector("script[src]")!.dispatchEvent(new player.Event("error"));
      expect(player.document.body.className).toBe("ready");
    } finally {
      timer.mockRestore(); clear.mockRestore();
      await player.happyDOM.close();
    }
  });

  it.each(["p", "tv", "reel"])("uses content-neutral status copy for /%s/ links", (kind) => {
    const html = instagramEmbedDocument(`https://instagram.com/${kind}/ABC/`)!;
    expect(html).toContain("Loading Instagram content");
    expect(html).toContain("load this content");
    expect(html).not.toContain("this reel");
    expect(html).not.toContain("Instagram reel…");
  });

  it("sandboxes the SDK in the executed HTML export without granting the board origin", async () => {
    const player = new Window({ settings: {
      enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true, suppressInsecureJavaScriptEnvironmentWarning: true,
    } });
    try {
      const board = createBoard();
      board.items = [linkItem("https://instagram.com/p/ABC/", { x: 0, y: 0 })];
      player.document.write(shareHtml(board));
      const frame = player.document.querySelector("#world .item > iframe")!;
      expect(frame.getAttribute("sandbox")).toBe(instagramSandbox);
      expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
      expect(frame.getAttribute("srcdoc")).toContain("https://www.instagram.com/embed.js");
    } finally {
      await player.happyDOM.close();
    }
  });
  it("replaces a blank or blocked player with a watch link after the load timeout", async () => {
    const player = new Window({ settings: {
      enableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      handleDisabledFileLoadingAsSuccess: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    } });
    const timer = vi.spyOn(player, "setTimeout").mockReturnValue(1 as never);
    try {
      player.document.write(instagramEmbedDocument("https://instagram.com/reel/DfgvYMno7G-/")!);
      expect(player.document.getElementById("message")!.textContent).toContain("Loading");
      const callback = timer.mock.calls.find((call) => call[1] === 15000)![0] as () => void;
      callback();
      expect(player.document.body.className).toBe("failed");
      expect(player.document.getElementById("message")!.textContent).toContain("couldn't load");
      expect(player.document.querySelector("#status a")!.getAttribute("href")).toBe(
        "https://www.instagram.com/reel/DfgvYMno7G-/",
      );
    } finally {
      timer.mockRestore();
      await player.happyDOM.close();
    }
  });
  it("loads the reported reel without tracking parameters", () => {
    const html = instagramEmbedDocument("https://www.instagram.com/reel/DfgvYMno7G-/?utm_source=ig_web_copy_link&rpxt=NTc4MTIwNjQ2YQ==")!;
    expect(html).toContain('data-instgrm-permalink="https://www.instagram.com/reel/DfgvYMno7G-/"');
    expect(html).not.toContain("utm_source");
    expect(html).not.toContain("rpxt");
  });
  it.each([
    "https://www.instagram.com/reel/ABC_123-/?igsh=tracking",
    "https://instagram.com/reels/ABC_123-/",
    "https://m.instagram.com/reel/ABC_123-/",
    "https://instagr.am/reel/ABC_123-/",
  ])("initializes the official player for %s", (url) => {
    expect(instagramPermalink(url)).toBe("https://www.instagram.com/reel/ABC_123-/");
    expect(embedUrl(url)).toBe("https://www.instagram.com/reel/ABC_123-/embed/");
    const html = instagramEmbedDocument(url)!;
    expect(html).toContain('data-instgrm-permalink="https://www.instagram.com/reel/ABC_123-/"');
    expect(html).toContain('data-instgrm-version="14"');
    expect(html).toContain('<script async src="https://www.instagram.com/embed.js"></script>');
    expect(html).not.toContain("igsh");
    expect(html).toContain("View on Instagram");
  });

  it.each([
    "https://instagram.com.evil/reel/ABC/",
    "javascript:alert(1)",
    "https://instagram.com/reel/ABC%22%3E%3Cscript%3E/",
    "https://instagram.com/stories/person/123/",
    "https://example.com/reel/ABC/",
  ])("does not inject an SDK document for %s", (url) => {
    expect(instagramEmbedDocument(url)).toBeUndefined();
  });

  it("packages the player document in exported HTML while keeping the board editable", () => {
    const board = createBoard("Reels");
    board.items = [linkItem("https://instagram.com/reel/ABC/", { x: 0, y: 0 })];
    const html = shareHtml(board);
    const json = html.match(/<script id="rtboard-data" type="application\/json">(.*?)<\/script>/s)![1];
    const data = JSON.parse(json);
    expect(data.embedDocuments[board.items[0].id]).toBe(
      instagramEmbedDocument(board.items[0].src!),
    );
    expect(json).not.toContain("<script");
    expect(parseBoardFile(html).items[0].src).toBe(board.items[0].src);
  });
});
