import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Task = {
  id?: string | number;
  status?: string;
  archivedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type MilestoneBucket = {
  tasks?: Task[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

type TasksFile = Record<string, MilestoneBucket>;
type ArchiveFile = Record<string, { tasks: Task[] }>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TASKS_PATH =
  process.env["TASKMASTER_TASKS_PATH"] ?? resolve(ROOT, "tasks", "tasks.json");
const ARCHIVE_PATH =
  process.env["TASKMASTER_ARCHIVE_PATH"] ?? resolve(ROOT, "tasks", "tasks.archive.json");

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isDone(task: Task): boolean {
  return task.status === "done";
}

function shouldRemainInTasks(task: Task): boolean {
  return task.status === "pending" || task.status === "in-progress";
}

function toTaskId(task: Task): string {
  const id = task.id;
  return typeof id === "number" || typeof id === "string" ? String(id) : "";
}

function withArchivedAt(task: Task, archivedAt: string): Task {
  if (typeof task.archivedAt === "string" && task.archivedAt.length > 0) {
    return task;
  }
  return { ...task, archivedAt };
}

function dedupeByTaskId(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const result: Task[] = [];

  for (const task of tasks) {
    const key = toTaskId(task);
    if (key.length === 0) {
      result.push(task);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(task);
  }

  return result;
}

function updateMetadata(bucket: MilestoneBucket): MilestoneBucket {
  if (bucket.metadata === undefined || typeof bucket.metadata !== "object") {
    return bucket;
  }

  const tasks = Array.isArray(bucket.tasks) ? bucket.tasks : [];
  const metadata = { ...bucket.metadata };

  if (typeof metadata.taskCount === "number") {
    metadata.taskCount = tasks.length;
  }
  if (typeof metadata.completedCount === "number") {
    metadata.completedCount = tasks.filter(isDone).length;
  }
  if (typeof metadata.lastModified === "string") {
    metadata.lastModified = new Date().toISOString();
  }

  return { ...bucket, metadata };
}

function main(): void {
  const tasksJson = readJsonFile<TasksFile>(TASKS_PATH, {});
  const archiveJson = readJsonFile<ArchiveFile>(ARCHIVE_PATH, {});
  const now = new Date().toISOString();

  const nextTasks: TasksFile = {};
  const nextArchive: ArchiveFile = { ...archiveJson };

  for (const [milestone, bucket] of Object.entries(tasksJson)) {
    const currentTasks = Array.isArray(bucket.tasks) ? bucket.tasks : [];
    const remaining = currentTasks.filter(shouldRemainInTasks);
    const doneTasks = currentTasks
      .filter(isDone)
      .map((task) => withArchivedAt(task, now));

    const currentArchiveTasks = Array.isArray(nextArchive[milestone]?.tasks)
      ? nextArchive[milestone].tasks
      : [];
    const mergedArchiveTasks = dedupeByTaskId([...currentArchiveTasks, ...doneTasks]);

    if (doneTasks.length > 0 || currentArchiveTasks.length > 0) {
      nextArchive[milestone] = {
        tasks: mergedArchiveTasks,
      };
    }

    if (remaining.length > 0) {
      nextTasks[milestone] = updateMetadata({
        ...bucket,
        tasks: remaining,
      });
    }
  }

  writeJsonFile(TASKS_PATH, nextTasks);
  writeJsonFile(ARCHIVE_PATH, nextArchive);
}

main();
