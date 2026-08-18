import { describe, it, expect } from "vitest";
import { decidePaneClose } from "./pane-close-decision";

describe("decidePaneClose", () => {
  it("closes just the clicked pane when siblings remain", () => {
    expect(decidePaneClose([1, 2, 3], 2)).toBe("close-pane");
  });

  it("closes the tab when the clicked pane is the last one", () => {
    expect(decidePaneClose([7], 7)).toBe("close-tab");
  });

  // The reported bug: a click that outlives its pane must not escalate into a
  // tab close, which would kill every sibling split.
  it("ignores a close for a pane the manager no longer holds", () => {
    expect(decidePaneClose([4, 5], 9)).toBe("ignore");
  });

  it("ignores a close when the manager holds one unrelated pane", () => {
    expect(decidePaneClose([4], 9)).toBe("ignore");
  });

  it("ignores a close when the manager holds no panes", () => {
    expect(decidePaneClose([], 1)).toBe("ignore");
  });
});
