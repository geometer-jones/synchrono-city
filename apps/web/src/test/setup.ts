import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  globalThis.AbortController = window.AbortController;
  globalThis.AbortSignal = window.AbortSignal;

  if (window.Request) {
    globalThis.Request = window.Request;
  }
  if (window.Response) {
    globalThis.Response = window.Response;
  }
  if (window.Headers) {
    globalThis.Headers = window.Headers;
  }
}
