// A neutral acceptance test for slice SL-002, written ONLY from the text of its acceptance criteria.
// It must not encode any choice the criteria do not state: any 2xx answers to a create, a list returned
// either as an array or as { tasks }, and "open" meaning no completion time. It is copied next to a
// project's own tests (it imports that project's tests/helpers/server.ts) and run against each condition.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newDbPath, startServer } from "./helpers/server.ts";

const create = (base: string, title: string) =>
  fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });

async function list(base: string): Promise<Array<{ title: string; completed_at?: string | null }>> {
  const response = await fetch(`${base}/api/tasks`);
  assert.equal(response.status, 200);
  const body = await response.json();
  return Array.isArray(body) ? body : body.tasks;
}

describe("SL-002, neutral acceptance (from the criteria text only)", () => {
  it("AC-1: on an empty list, creating 'Buy milk' makes the list show one open task titled 'Buy milk'", async () => {
    const server = await startServer();
    try {
      assert.deepEqual(await list(server.baseUrl), []);
      const response = await create(server.baseUrl, "Buy milk");
      assert.ok(response.status >= 200 && response.status < 300, `create answered ${response.status}`);
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
      const response = await create(server.baseUrl, "Buy milk");
      assert.ok(response.status >= 200 && response.status < 300, `create answered ${response.status}`);
      await server.stop(); // SIGKILL
      server = await startServer(dbPath);
      const tasks = await list(server.baseUrl);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].title, "Buy milk");
    } finally {
      await server.stop();
    }
  });
});
