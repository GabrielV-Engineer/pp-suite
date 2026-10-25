// Neutral acceptance test for slice SL-006 (delete a task permanently), written only from its criteria and
// from .architect/architecture.md: DELETE /api/tasks/:id is a hard delete answering 204, errors are
// { error: { code, message } } and a missing task is 404. The confirmation in the page is not covered.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create, isOk, list, newDbPath, startServer } from "./support.ts";

const remove = (base: string, id: number) => fetch(`${base}/api/tasks/${id}`, { method: "DELETE" });

describe("SL-006, neutral acceptance (from the criteria text only)", () => {
  it("AC-1: a deleted task disappears from the list and does not return after a kill and restart", async () => {
    const dbPath = newDbPath();
    let server = await startServer(dbPath);
    try {
      assert.ok(isOk((await create(server.baseUrl, "Keep me")).status));
      assert.ok(isOk((await create(server.baseUrl, "Delete me")).status));
      const doomed = (await list(server.baseUrl)).find((t) => t.title === "Delete me")!;
      const response = await remove(server.baseUrl, doomed.id);
      assert.equal(response.status, 204);
      assert.deepEqual((await list(server.baseUrl)).map((t) => t.title), ["Keep me"]);
      await server.stop();
      server = await startServer(dbPath);
      assert.deepEqual((await list(server.baseUrl)).map((t) => t.title), ["Keep me"]);
    } finally {
      await server.stop();
    }
  });

  it("AC-2: deleting a task that does not exist answers 404 with an error, and changes nothing", async () => {
    const server = await startServer();
    try {
      assert.ok(isOk((await create(server.baseUrl, "Only one")).status));
      const response = await remove(server.baseUrl, 99999);
      assert.equal(response.status, 404);
      assert.equal(typeof (await response.json())?.error?.message, "string");
      assert.equal((await list(server.baseUrl)).length, 1);
    } finally {
      await server.stop();
    }
  });

  it("AC-2: deleting the same task twice answers 404 the second time", async () => {
    const server = await startServer();
    try {
      assert.ok(isOk((await create(server.baseUrl, "Once")).status));
      const [task] = await list(server.baseUrl);
      assert.equal((await remove(server.baseUrl, task.id)).status, 204);
      assert.equal((await remove(server.baseUrl, task.id)).status, 404);
    } finally {
      await server.stop();
    }
  });
});
