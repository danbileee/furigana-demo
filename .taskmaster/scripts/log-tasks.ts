import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Task = {
  id?: string | number;
  archivedAt?: string;
  [key: string]: unknown;
};

type ArchiveFile = Record<string, { tasks?: Task[] }>;

type LogEvent = {
  event: "archived";
  tag: string;
  taskId: string;
  timestamp: string;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_PATH =
  process.env["TASKMASTER_ARCHIVE_PATH"] ?? resolve(ROOT, "tasks", "tasks.archive.json");
const LOG_PATH = process.env["TASKMASTER_LOG_PATH"] ?? resolve(ROOT, "tasks", "tasks.log.jsonl");

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function readTextFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function toTaskId(task: Task): string {
  const id = task.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : "";
}

function toLogEventsAndNextArchive(archive: ArchiveFile): {
  events: LogEvent[];
  nextArchive: ArchiveFile;
} {
  const events: LogEvent[] = [];
  const nextArchive: ArchiveFile = {};

  for (const [tag, bucket] of Object.entries(archive)) {
    const tasks = Array.isArray(bucket.tasks) ? bucket.tasks : [];
    const remainingTasks: Task[] = [];

    for (const task of tasks) {
      const taskId = toTaskId(task);
      if (taskId.length === 0) {
        remainingTasks.push(task);
        continue;
      }
      const timestamp =
        typeof task.archivedAt === "string" && task.archivedAt.length > 0
          ? task.archivedAt
          : new Date().toISOString();
      events.push({
        event: "archived",
        tag,
        taskId,
        timestamp,
      });
    }

    if (remainingTasks.length > 0) {
      nextArchive[tag] = { tasks: remainingTasks };
    }
  }

  return { events, nextArchive };
}

function main(): void {
  const archive = readJsonFile<ArchiveFile>(ARCHIVE_PATH, {});
  const { events, nextArchive } = toLogEventsAndNextArchive(archive);

  ensureParent(LOG_PATH);
  const currentLogRaw = readTextFile(LOG_PATH);
  const currentLog = currentLogRaw
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .join("\n");
  const appended = events.map((event) => JSON.stringify(event)).join("\n");
  const nextLog =
    appended.length === 0
      ? currentLog
      : `${currentLog}${currentLog.length > 0 && !currentLog.endsWith("\n") ? "\n" : ""}${appended}\n`;

  writeFileSync(LOG_PATH, nextLog, "utf8");
  writeFileSync(ARCHIVE_PATH, `${JSON.stringify(nextArchive, null, 2)}\n`, "utf8");
}

main();
