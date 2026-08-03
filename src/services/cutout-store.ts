import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";

import type {
  CutoutCategory,
  CutoutRecord,
  CutoutSource
} from "../domain/cutout.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoreOptions {
  directory: string;
  ttlMs: number;
  now?: () => number;
}

interface CreateCutoutInput {
  image: Buffer;
  description: string;
  source: CutoutSource;
  usedFallback: boolean;
  transparencyRatio: number;
}

interface UpdateCutoutInput {
  name: string;
  category: CutoutCategory;
}

export class CutoutStore {
  private readonly now: () => number;

  constructor(private readonly options: StoreOptions) {
    this.now = options.now ?? Date.now;
  }

  async init(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true });
  }

  async create(input: CreateCutoutInput): Promise<CutoutRecord> {
    const id = randomUUID();
    const createdAtMs = this.now();
    const record: CutoutRecord = {
      id,
      status: "ready",
      description: input.description,
      source: input.source,
      name: null,
      category: null,
      attributes: null,
      mimeType: "image/png",
      usedFallback: input.usedFallback,
      transparencyRatio: input.transparencyRatio,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.options.ttlMs).toISOString()
    };

    await this.writeAtomically(this.imagePath(id), input.image);

    try {
      await this.writeRecord(record);
    } catch (error) {
      await this.unlinkIfPresent(this.imagePath(id));
      throw error;
    }

    return record;
  }

  async get(id: string): Promise<CutoutRecord | null> {
    if (!this.isValidId(id)) {
      return null;
    }

    const record = await this.readRecord(id);

    if (!record) {
      return null;
    }

    if (Date.parse(record.expiresAt) <= this.now()) {
      await this.delete(id);
      return null;
    }

    return record;
  }

  async getImage(id: string): Promise<Buffer | null> {
    if (!(await this.get(id))) {
      return null;
    }

    try {
      return await readFile(this.imagePath(id));
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateCutoutInput
  ): Promise<CutoutRecord | null> {
    const current = await this.get(id);

    if (!current) {
      return null;
    }

    const updated: CutoutRecord = {
      ...current,
      name: input.name,
      category: input.category,
      attributes: null
    };
    await this.writeRecord(updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.isValidId(id)) {
      return false;
    }

    const results = await Promise.all([
      this.unlinkIfPresent(this.metadataPath(id)),
      this.unlinkIfPresent(this.imagePath(id))
    ]);
    return results.some(Boolean);
  }

  async cleanupExpired(): Promise<number> {
    await this.init();
    const entries = await readdir(this.options.directory, {
      withFileTypes: true
    });
    let removed = 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const id = entry.name.slice(0, -".json".length);

      if (!this.isValidId(id)) {
        continue;
      }

      const record = await this.readRecord(id);

      if (record && Date.parse(record.expiresAt) <= this.now()) {
        await this.delete(id);
        removed += 1;
      }
    }

    return removed;
  }

  private async readRecord(id: string): Promise<CutoutRecord | null> {
    try {
      const raw = await readFile(this.metadataPath(id), "utf8");
      return JSON.parse(raw) as CutoutRecord;
    } catch (error) {
      if (this.isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async writeRecord(record: CutoutRecord): Promise<void> {
    await this.writeAtomically(
      this.metadataPath(record.id),
      Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8")
    );
  }

  private async writeAtomically(path: string, contents: Buffer): Promise<void> {
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, contents, { flag: "wx" });

    try {
      await rename(temporaryPath, path);
    } catch (error) {
      await this.unlinkIfPresent(temporaryPath);
      throw error;
    }
  }

  private async unlinkIfPresent(path: string): Promise<boolean> {
    try {
      await unlink(path);
      return true;
    } catch (error) {
      if (this.isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  private metadataPath(id: string): string {
    return join(this.options.directory, `${id}.json`);
  }

  private imagePath(id: string): string {
    return join(this.options.directory, `${id}.png`);
  }

  private isValidId(id: string): boolean {
    return UUID_PATTERN.test(id);
  }

  private isNotFound(error: unknown): boolean {
    return (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    );
  }
}
