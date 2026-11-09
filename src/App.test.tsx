// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("workspace interactions", () => {
  it("creates a separate board, adds and edits a note, then undoes and redoes", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.change(
      screen.getByLabelText("Board name", { selector: ".modal input" }),
      { target: { value: "My collection" } },
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create board",
      }),
    );
    expect(screen.getByRole("heading", { name: "My collection" })).toBeTruthy();
    expect(container.querySelectorAll(".board-item")).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Add your first note" }),
    );
    const textarea = screen.getByLabelText("Edit card text");
    fireEvent.change(textarea, { target: { value: "A useful thought" } });
    fireEvent.blur(textarea);
    expect(screen.getByText("A useful thought")).toBeTruthy();
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(container.querySelectorAll(".board-item")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(container.querySelectorAll(".board-item")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(container.querySelectorAll(".board-item")).toHaveLength(0);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("rtboard.workspace.v1")!).boards,
      ).toHaveLength(2),
    );
  });
  it("restores saved content after reload", async () => {
    const first = render(<App />);
    fireEvent.doubleClick(first.container.querySelector(".item-note")!);
    const text = screen.getByLabelText("Edit card text");
    fireEvent.change(text, { target: { value: "Remember this" } });
    fireEvent.blur(text);
    await waitFor(() =>
      expect(localStorage.getItem("rtboard.workspace.v1")).toContain(
        "Remember this",
      ),
    );
    first.unmount();
    render(<App />);
    expect(screen.getByText("Remember this")).toBeTruthy();
  });
  it("adds safe bookmarks and filters a board with search", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Link", { exact: true }), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Title optional/), {
      target: { value: "Reading list" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to board" }));
    expect(screen.getByText("Reading list")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Search this board/ }));
    fireEvent.change(screen.getByLabelText("Search board"), {
      target: { value: "Reading list" },
    });
    expect(document.querySelectorAll(".search-results button")).toHaveLength(1);
  });
});
