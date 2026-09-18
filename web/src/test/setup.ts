// Vitest global setup: extends `expect` with jest-dom matchers and resets the
// DOM/mocks between tests so component and localStorage state never leaks.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
