import { describe, it, expect } from "vitest";
import { assertSafeToReset, DemoResetRefused, chunk } from "./demo-reset";

/**
 * The reset deletes an entire company. The only thing between it and a real
 * tenant is this guard, so it is tested harder than the thing it guards.
 */
describe("demo reset guard", () => {
  it("allows the demo project", () => {
    expect(assertSafeToReset("worktrack-demo-af")).toBe("worktrack-demo-af");
  });

  it("refuses production", () => {
    expect(() => assertSafeToReset("worktrack-prod")).toThrow(DemoResetRefused);
  });

  it("refuses anything that merely reads as live", () => {
    for (const id of ["acme-production", "my-live-app", "WORKTRACK-PROD", "app-Live-2"]) {
      expect(() => assertSafeToReset(id), id).toThrow(DemoResetRefused);
    }
  });

  it("refuses another company's project even when the name looks harmless", () => {
    // Deleting the wrong tenant is just as bad when the project is not "prod".
    for (const id of ["talar-af-prod", "safebeauty", "stealthapp-b10f4", "worktrack-demo"]) {
      expect(() => assertSafeToReset(id), id).toThrow(DemoResetRefused);
    }
  });

  it("refuses when it cannot tell where it is", () => {
    // Failing closed: an unknown project is a reason not to delete, not a
    // reason to assume the best.
    expect(() => assertSafeToReset("")).toThrow(DemoResetRefused);
  });

  it("does not accept a project that merely contains the demo name", () => {
    for (const id of ["worktrack-demo-af-2", "x-worktrack-demo-af", "worktrack-demo-af.appspot.com"]) {
      expect(() => assertSafeToReset(id), id).toThrow(DemoResetRefused);
    }
  });
});

/**
 * Auth deletion is batched because deleteUsers takes at most 1000 at a time.
 * A batching bug here would leave visitor accounts behind and the reset would
 * quietly stop being a reset.
 */
describe("auth deletion batching", () => {
  it("keeps a short list in one batch", () => {
    expect(chunk([1, 2, 3], 1000)).toEqual([[1, 2, 3]]);
  });

  it("splits exactly on the boundary without an empty trailing batch", () => {
    const batches = chunk(Array.from({ length: 2000 }, (_, i) => i), 1000);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1000);
    expect(batches[1]).toHaveLength(1000);
  });

  it("puts the remainder in a final short batch", () => {
    const batches = chunk(Array.from({ length: 2001 }, (_, i) => i), 1000);
    expect(batches).toHaveLength(3);
    expect(batches[2]).toEqual([2000]);
  });

  it("loses nothing across batches", () => {
    const input = Array.from({ length: 4321 }, (_, i) => i);
    expect(chunk(input, 1000).flat()).toEqual(input);
  });

  it("has nothing to do for an empty list", () => {
    expect(chunk([], 1000)).toEqual([]);
  });

  it("refuses a zero size rather than looping forever", () => {
    expect(() => chunk([1, 2], 0)).toThrow(RangeError);
  });
});
