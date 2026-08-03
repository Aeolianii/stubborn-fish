import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CutoutStore } from "../src/services/cutout-store.js";

const createdDirectories: string[] = [];

function makeDirectory(): string {
  const directory = resolve(
    process.cwd(),
    ".test-tmp",
    `cutout-store-${randomUUID()}`
  );
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("CutoutStore", () => {
  it("stores and retrieves a temporary PNG with metadata", async () => {
    const store = new CutoutStore({
      directory: makeDirectory(),
      ttlMs: 60_000
    });
    await store.init();

    const created = await store.create({
      image: Buffer.from("transparent-png"),
      description: "蓝色杯子",
      source: "camera",
      usedFallback: false,
      transparencyRatio: 0.72
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(created.name).toBeNull();
    expect(created.category).toBeNull();
    expect(created.attributes).toBeNull();
    await expect(store.getImage(created.id)).resolves.toEqual(
      Buffer.from("transparent-png")
    );
    await expect(store.get(created.id)).resolves.toMatchObject({
      id: created.id,
      description: "蓝色杯子",
      source: "camera"
    });
  });

  it("updates the placeholder name and category metadata", async () => {
    const store = new CutoutStore({
      directory: makeDirectory(),
      ttlMs: 60_000
    });
    await store.init();
    const created = await store.create({
      image: Buffer.from("png"),
      description: "一株水草",
      source: "album",
      usedFallback: true,
      transparencyRatio: 0.65
    });

    const updated = await store.update(created.id, {
      name: "小绿",
      category: "plant"
    });

    expect(updated).toMatchObject({
      name: "小绿",
      category: "plant",
      attributes: null
    });
  });

  it("removes expired records and their image files", async () => {
    let now = 1_000;
    const store = new CutoutStore({
      directory: makeDirectory(),
      ttlMs: 500,
      now: () => now
    });
    await store.init();
    const created = await store.create({
      image: Buffer.from("png"),
      description: "石头",
      source: "album",
      usedFallback: false,
      transparencyRatio: 0.5
    });

    now = 2_000;
    expect(await store.cleanupExpired()).toBe(1);
    await expect(store.get(created.id)).resolves.toBeNull();
    await expect(store.getImage(created.id)).resolves.toBeNull();
  });

  it("does not allow path traversal through a record id", async () => {
    const store = new CutoutStore({
      directory: makeDirectory(),
      ttlMs: 60_000
    });
    await store.init();

    await expect(store.get(join("..", "secret"))).resolves.toBeNull();
    await expect(store.getImage(join("..", "secret"))).resolves.toBeNull();
  });
});
