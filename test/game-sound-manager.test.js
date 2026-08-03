import { beforeAll, describe, expect, it } from "vitest";

const createdAudio = [];

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.preload = "";
    this.loop = false;
    this.volume = 1;
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.playCount = 0;
    this.pauseCount = 0;
    createdAudio.push(this);
  }

  addEventListener() {}

  play() {
    this.paused = false;
    this.playCount += 1;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.pauseCount += 1;
  }
}

beforeAll(async () => {
  globalThis.Audio = FakeAudio;
  await import("../game/js/sound-manager.js");
});

describe("local aquarium sound manager", () => {
  it("stays silent until enabled and starts ambient audio only after a user unlock", () => {
    const manager = globalThis.SoundManager;
    manager.init({ enabled: false });

    manager.play("feed");
    expect(createdAudio).toHaveLength(0);

    manager.unmute();
    manager.play("feed");
    expect(createdAudio).toHaveLength(0);

    manager.unlock();
    const ambient = createdAudio.filter((audio) => audio.loop);
    expect(ambient).toHaveLength(3);
    expect(ambient.every((audio) => audio.playCount === 1)).toBe(true);
    manager.play("feed");
    expect(createdAudio.find((audio) => audio.src.endsWith("/interaction/feed.mp3")))
      .toMatchObject({ playCount: 1, volume: 0.75 });

    manager.mute();
    expect(manager.isEnabled()).toBe(false);
    expect(createdAudio.every((audio) => audio.paused)).toBe(true);
  });

  it("selects a bundled coin sound without playing while muted", () => {
    const before = createdAudio.length;
    globalThis.SoundManager.play("coin");
    expect(createdAudio).toHaveLength(before);
  });
});
