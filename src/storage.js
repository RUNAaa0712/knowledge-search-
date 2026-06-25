import { mkdir, opendir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const EMPTY_STORE = {
  version: 1,
  entries: []
};

export class KnowledgeStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.legacySingleFile = filePath.endsWith(".json");
  }

  async load() {
    const entries = [];
    for await (const entry of this.entries()) {
      entries.push(entry);
    }

    return { version: 1, entries };
  }

  async all() {
    const data = await this.load();
    return data.entries;
  }

  async *entries() {
    if (this.legacySingleFile) {
      yield* await this.readLegacyEntries();
      return;
    }

    yield* this.readDirectoryEntries();
  }

  async upsertMany(entries) {
    if (this.legacySingleFile) {
      await this.upsertLegacy(entries);
      return;
    }

    for (const entry of entries) {
      await this.writeEntryFile(entry);
    }
  }

  async save(data) {
    if (this.legacySingleFile) {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      return;
    }

    await this.upsertMany(data.entries ?? []);
  }

  async readLegacyEntries() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        return EMPTY_STORE.entries;
      }

      throw error;
    }
  }

  async upsertLegacy(entries) {
    const currentEntries = await this.readLegacyEntries();
    const byId = new Map(currentEntries.map((entry) => [entry.id, entry]));

    for (const entry of entries) {
      byId.set(entry.id, entry);
    }

    await this.save({
      version: 1,
      entries: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    });
  }

  async *readDirectoryEntries() {
    for await (const filePath of walkJsonFiles(this.filePath)) {
      let raw;
      try {
        raw = await readFile(filePath, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.warn(`Failed to read knowledge entry: ${filePath}`, error);
        }
        continue;
      }

      try {
        yield JSON.parse(raw);
      } catch (error) {
        console.warn(`Failed to parse knowledge entry: ${filePath}`, error);
      }
    }
  }

  async writeEntryFile(entry) {
    const filePath = this.entryPath(entry);
    const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(tmpPath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
    await rename(tmpPath, filePath);
  }

  entryPath(entry) {
    return join(this.filePath, "entries", safePathPart(entry.forumId), `${safePathPart(entry.threadId)}.json`);
  }
}

async function* walkJsonFiles(rootPath) {
  let directory;
  try {
    directory = await opendir(rootPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for await (const dirent of directory) {
    const fullPath = join(rootPath, dirent.name);
    if (dirent.isDirectory()) {
      yield* walkJsonFiles(fullPath);
    } else if (dirent.isFile() && dirent.name.endsWith(".json")) {
      yield fullPath;
    }
  }
}

function safePathPart(value) {
  return encodeURIComponent(String(value));
}
