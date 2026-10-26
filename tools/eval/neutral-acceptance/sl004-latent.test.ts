// "Latent quality" probes for the title-validation feature (slice SL-004), written BEFORE any run and shown to no condition.
//
// The neutral acceptance test (sl004.test.ts) checks what the request says: an empty title, a 501-character title, exactly 500,
// trimming. These probes check what a careful reviewer would also expect of the same feature, and that the request does not say:
// bodies that are not what the API expects, and a limit that means the same thing in the API and in the database.
//
// Everything expected here comes from .architect/architecture.md, which every condition has:
//   "Errors are { error: { code, message } } with invalid_json and validation_failed as 400, not_found as 404."
//   "A title is trimmed and 1 to 500 characters long."
// and from migrations/001-create-tasks.sql, which has CHECK (length(title) BETWEEN 1 AND 500): SQLite counts Unicode code points,
// JavaScript's String.length counts UTF-16 units. A title the API lets through and the database refuses is a 500.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create, isOk, list, startServer } from "./support.ts";

const raw = (base: string, body: string) => fetch(`${base}/api/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body });

const expectError = async (response: Response, status: number, code: string) => {
  assert.equal(response.status, status, `expected ${status}, got ${response.status}`);
  const body = await response.json();
  assert.equal(body?.error?.code, code, `expected error code ${code}`);
  assert.equal(typeof body?.error?.message, "string");
};

describe("SL-004 latent quality probes", () => {
  it("L1: a body whose title is missing, null, a number or not a string is a 400 validation_failed, never a 500", async () => {
    const server = await startServer();
    try {
      for (const body of ["{}", '{"title":null}', '{"title":123}', '{"title":["a"]}']) {
        await expectError(await raw(server.baseUrl, body), 400, "validation_failed");
      }
      assert.deepEqual(await list(server.baseUrl), []);
    } finally {
      await server.stop();
    }
  });

  it("L2: a body that is not JSON is a 400 invalid_json", async () => {
    const server = await startServer();
    try {
      await expectError(await raw(server.baseUrl, "{bad"), 400, "invalid_json");
      await expectError(await raw(server.baseUrl, ""), 400, "invalid_json");
    } finally {
      await server.stop();
    }
  });

  it("L3: a body that is JSON but not an object (an array, a string, null) is a 400, never a 500", async () => {
    const server = await startServer();
    try {
      for (const body of ["[]", '"hello"', "null"]) {
        const response = await raw(server.baseUrl, body);
        assert.equal(response.status, 400, `${body} answered ${response.status}`);
      }
    } finally {
      await server.stop();
    }
  });

  it("L4: the limit means the same in the API and in the database: 501 emojis are rejected with a 400, not a 500", async () => {
    const server = await startServer();
    try {
      await expectError(await create(server.baseUrl, "😀".repeat(501)), 400, "validation_failed");
    } finally {
      await server.stop();
    }
  });

  it("L5: 300 emojis (300 characters, 600 UTF-16 units) are a valid title and are stored", async () => {
    const server = await startServer();
    try {
      const response = await create(server.baseUrl, "😀".repeat(300));
      assert.ok(isOk(response.status), `300 emojis answered ${response.status}`);
      assert.ok((await list(server.baseUrl)).some((t) => t.title === "😀".repeat(300)));
    } finally {
      await server.stop();
    }
  });

  it("L6: a title that is only tabs, newlines or spaces is rejected like an empty one", async () => {
    const server = await startServer();
    try {
      await expectError(await create(server.baseUrl, "\n\t  \n"), 400, "validation_failed");
    } finally {
      await server.stop();
    }
  });

  it("L7: the server is still up and consistent after all the bad requests, and a good one still works", async () => {
    const server = await startServer();
    try {
      await raw(server.baseUrl, "{bad");
      await raw(server.baseUrl, '{"title":123}');
      await create(server.baseUrl, "x".repeat(501));
      assert.ok(isOk((await create(server.baseUrl, "Still works")).status));
      assert.deepEqual((await list(server.baseUrl)).map((t) => t.title), ["Still works"]);
    } finally {
      await server.stop();
    }
  });

  it("L8: the rejection message is the same kind of text for the same fault (it names the reason, not a stack)", async () => {
    const server = await startServer();
    try {
      const response = await create(server.baseUrl, "");
      const body = await response.json();
      assert.ok(String(body?.error?.message ?? "").length > 3);
      assert.ok(!/\bat\s.+\(.+:\d+:\d+\)/.test(JSON.stringify(body)), "no stack trace in the answer");
    } finally {
      await server.stop();
    }
  });
});
