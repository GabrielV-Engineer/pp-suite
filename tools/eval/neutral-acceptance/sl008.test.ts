// Neutral acceptance test for slice SL-008 (open tasks newest first, with an empty state), written only
// from its criteria and from .architect/architecture.md (GET /api/tasks answers 200 { tasks }). The empty
// state shown in the page is not covered: no browser is involved.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create, isOk, list, startServer } from "./support.ts";

describe("SL-008, neutral acceptance (from the criteria text only)", () => {
  it("AC-1: tasks created as A, B, C are listed C, B, A", async () => {
    const server = await startServer();
    try {
      for (const title of ["A", "B", "C"]) assert.ok(isOk((await create(server.baseUrl, title)).status));
      assert.deepEqual((await list(server.baseUrl)).map((t) => t.title), ["C", "B", "A"]);
    } finally {
      await server.stop();
    }
  });

  it("AC-2: tasks created back to back come out in reverse creation order, every time", async () => {
    const server = await startServer();
    try {
      const titles = Array.from({ length: 30 }, (_, i) => `task ${i}`);
      for (const title of titles) assert.ok(isOk((await create(server.baseUrl, title)).status));
      assert.deepEqual((await list(server.baseUrl)).map((t) => t.title), [...titles].reverse());
    } finally {
      await server.stop();
    }
  });

  it("AC-3: an empty list is a normal answer, not an error", async () => {
    const server = await startServer();
    try {
      const response = await fetch(`${server.baseUrl}/api/tasks`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).tasks, []);
    } finally {
      await server.stop();
    }
  });

  it("AC-4: with about 1000 tasks stored, the p95 of 20 sequential GETs is under 100 ms and the body under 400000 bytes", async () => {
    const server = await startServer();
    try {
      for (let i = 0; i < 1000; i++) assert.ok(isOk((await create(server.baseUrl, `task number ${i}`)).status));
      const times: number[] = [];
      let size = 0;
      for (let i = 0; i < 20; i++) {
        const started = performance.now();
        const response = await fetch(`${server.baseUrl}/api/tasks`);
        const text = await response.text();
        times.push(performance.now() - started);
        size = Math.max(size, Buffer.byteLength(text));
        assert.equal(response.status, 200);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(0.95 * times.length) - 1];
      assert.ok(p95 < 100, `p95 was ${p95.toFixed(1)} ms`);
      assert.ok(size < 400000, `body was ${size} bytes`);
    } finally {
      await server.stop();
    }
  });
});
