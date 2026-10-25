// Neutral acceptance test for slice SL-002, written ONLY from the text of its acceptance criteria.
// Any 2xx answers a create; the list is an array or { tasks }; "open" means no completion time.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create, isOk, list, newDbPath, startServer } from "./support.ts";

describe("SL-002, neutral acceptance (from the criteria text only)", () => {
  it("AC-1: on an empty list, creating 'Buy milk' makes the list show one open task titled 'Buy milk'", async () => {
    const server = await startServer();
    try {
      assert.deepEqual(await list(server.baseUrl), []);
      const response = await create(server.baseUrl, "Buy milk");
      assert.ok(isOk(response.status), `create answered ${response.status}`);
      const tasks = await list(server.baseUrl);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].title, "Buy milk");
      assert.ok(!tasks[0].completed_at, "the task is open");
    } finally {
      await server.stop();
    }
  });

  it("AC-2: a created task is still in the list after the server is killed with SIGKILL and restarted", async () => {
    const dbPath = newDbPath();
    let server = await startServer(dbPath);
    try {
      assert.ok(isOk((await create(server.baseUrl, "Buy milk")).status));
      await server.stop();
      server = await startServer(dbPath);
      const tasks = await list(server.baseUrl);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].title, "Buy milk");
    } finally {
      await server.stop();
    }
  });
});
