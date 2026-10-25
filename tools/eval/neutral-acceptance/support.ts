// Shared by the neutral acceptance tests. It knows only what .architect/architecture.md states for every
// condition: the server is started with `node src/server.ts` and configured through PORT and
// TASKS_DB_PATH, and the API is /api/tasks. It does not import anything from the project under test, so
// a condition that rewrites its own test helpers cannot affect the verdict.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Running {
  baseUrl: string;
  stop: () => Promise<void>;
}

export interface TaskView {
  id: number;
  title: string;
  completed_at?: string | null;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

export const newDbPath = () => join(mkdtempSync(join(tmpdir(), "neutral-")), "tasks.db");

export async function startServer(dbPath: string = newDbPath()): Promise<Running> {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, ["src/server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, TASKS_DB_PATH: dbPath, PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore"],
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode === null) child.kill("SIGKILL");
    await exited;
  };
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/api/tasks`);
      return { baseUrl, stop };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  await stop();
  throw new Error("the server did not answer within 8s");
}

export const create = (base: string, title: unknown) =>
  fetch(`${base}/api/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });

export async function list(base: string): Promise<TaskView[]> {
  const response = await fetch(`${base}/api/tasks`);
  if (response.status !== 200) throw new Error(`GET /api/tasks answered ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : body.tasks;
}

export const isOk = (status: number) => status >= 200 && status < 300;
