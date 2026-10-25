// Neutral acceptance test for slice SL-004 (reject empty and over-long titles), written only from its
// criteria and from the API facts in .architect/architecture.md: errors are { error: { code, message } },
// a title is trimmed and 1 to 500 characters long. Browser-visible criteria (a message on the form) are not
// covered: no browser is involved.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create, isOk, list, startServer } from "./support.ts";

const rejected = async (base: string, title: unknown) => {
  const response = await create(base, title);
  assert.ok(response.status >= 400 && response.status < 500, `expected a client error, got ${response.status}`);
  const body = await response.json();
  assert.equal(typeof body?.error?.message, "string", "the answer explains why");
  assert.ok(body.error.message.length > 0);
};

describe("SL-004, neutral acceptance (from the criteria text only)", () => {
  it("AC-1: an empty title, or one that is only spaces, creates no task and the answer says why", async () => {
    const server = await startServer();
    try {
      await rejected(server.baseUrl, "");
      await rejected(server.baseUrl, "    ");
      assert.deepEqual(await list(server.baseUrl), []);
    } finally {
      await server.stop();
    }
  });

  it("AC-2: a title of 501 characters creates no task", async () => {
    const server = await startServer();
    try {
      await rejected(server.baseUrl, "x".repeat(501));
      assert.deepEqual(await list(server.baseUrl), []);
    } finally {
      await server.stop();
    }
  });

  it("architecture: a title of exactly 500 characters is accepted, and surrounding spaces are trimmed", async () => {
    const server = await startServer();
    try {
      assert.ok(isOk((await create(server.baseUrl, "y".repeat(500))).status));
      assert.ok(isOk((await create(server.baseUrl, "  Buy milk  ")).status));
      const titles = (await list(server.baseUrl)).map((t) => t.title);
      assert.ok(titles.includes("y".repeat(500)));
      assert.ok(titles.includes("Buy milk"));
    } finally {
      await server.stop();
    }
  });

  it("scope: a 500-character title with spaces around it that trims to 500 is accepted (length is counted after trimming)", async () => {
    const server = await startServer();
    try {
      assert.ok(isOk((await create(server.baseUrl, ` ${"z".repeat(500)} `)).status));
    } finally {
      await server.stop();
    }
  });
});
