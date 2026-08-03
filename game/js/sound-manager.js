(function (root) {
  "use strict";

  var SFX_BASE = "/game/assets/sfx";
  var EFFECTS = {
    "ui-click": { file: "interaction/ui-click.mp3", volume: 0.55, pool: 4 },
    feed: { file: "interaction/feed.mp3", volume: 0.75, pool: 3 },
    splash: { file: "interaction/fish-enter.mp3", volume: 0.6, pool: 2 },
    "fish-swim": { file: "interaction/fish-swim.mp3", volume: 0.65, pool: 2 }
  };
  var AMBIENT = [
    { file: "ambient/bubbles.wav", volume: 0.5 },
    { file: "ambient/water-flow.mp3", volume: 0.4 },
    { file: "ambient/gentle-stream.mp3", volume: 0.3 }
  ];
  var pools = {};
  var poolIndexes = {};
  var ambientTracks = [];
  var initialized = false;
  var enabled = false;
  var unlocked = false;

  function audioSupported() {
    return typeof root.Audio === "function";
  }

  function createAudio(file, volume, loop) {
    var audio = new root.Audio(SFX_BASE + "/" + file);
    audio.preload = "auto";
    audio.loop = Boolean(loop);
    audio.volume = volume;
    audio.addEventListener("error", function audioLoadError() {
      if (root.console && typeof root.console.warn === "function") {
        root.console.warn("SFX load failed: " + file);
      }
    });
    return audio;
  }

  function playAudio(audio) {
    if (!audio) return;
    try {
      var result = audio.play();
      if (result && typeof result.catch === "function") {
        result.catch(function ignoreBlockedPlayback() {});
      }
    } catch (_error) {
      // Audio is optional; unsupported playback must not interrupt the aquarium.
    }
  }

  function stopAudio(audio, reset) {
    if (!audio) return;
    try {
      audio.pause();
      if (reset) audio.currentTime = 0;
    } catch (_error) {
      // Ignore media teardown errors from older WebViews.
    }
  }

  function effectTrack(name) {
    var definition = EFFECTS[name];
    if (!definition || !audioSupported()) return null;
    var pool = pools[name] || (pools[name] = []);
    var available = pool.find(function findAvailable(track) {
      return track.paused || track.ended;
    });
    if (!available && pool.length < definition.pool) {
      available = createAudio(definition.file, definition.volume, false);
      pool.push(available);
    }
    if (!available && pool.length) {
      var index = poolIndexes[name] || 0;
      available = pool[index % pool.length];
      poolIndexes[name] = index + 1;
    }
    return available || null;
  }

  function actualEffectName(name) {
    if (name !== "coin") return name;
    var number = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    var coinName = "coin-" + number;
    if (!EFFECTS[coinName]) {
      EFFECTS[coinName] = {
        file: "interaction/coins/" + coinName + ".ogg",
        volume: 0.5,
        pool: 1
      };
    }
    return coinName;
  }

  function play(name) {
    if (!enabled || !unlocked) return;
    var track = effectTrack(actualEffectName(name));
    if (!track) return;
    stopAudio(track, true);
    playAudio(track);
  }

  function startAmbient() {
    if (!enabled || !unlocked || !audioSupported()) return;
    if (!ambientTracks.length) {
      ambientTracks = AMBIENT.map(function createAmbient(definition) {
        return {
          audio: createAudio(definition.file, definition.volume, true),
          volume: definition.volume
        };
      });
    }
    ambientTracks.forEach(function startTrack(entry) {
      entry.audio.volume = entry.volume;
      if (entry.audio.paused) playAudio(entry.audio);
    });
  }

  function stopAmbient() {
    ambientTracks.forEach(function stopTrack(entry) {
      stopAudio(entry.audio, true);
    });
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (root.document) {
      root.document.removeEventListener("pointerdown", unlock, true);
      root.document.removeEventListener("keydown", unlock, true);
    }
    startAmbient();
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      startAmbient();
      return;
    }
    stopAmbient();
    Object.keys(pools).forEach(function stopPool(name) {
      pools[name].forEach(function stopTrack(track) {
        stopAudio(track, true);
      });
    });
  }

  function onDocumentClick(event) {
    var target = event.target;
    var button = target && typeof target.closest === "function"
      ? target.closest("button")
      : null;
    if (!button || button.disabled) return;
    unlock();
    play("ui-click");
  }

  function init(options) {
    if (initialized) {
      if (options && Object.prototype.hasOwnProperty.call(options, "enabled")) {
        setEnabled(options.enabled);
      }
      return;
    }
    initialized = true;
    enabled = Boolean(options && options.enabled);
    if (!root.document) return;
    root.document.addEventListener("pointerdown", unlock, true);
    root.document.addEventListener("keydown", unlock, true);
    root.document.addEventListener("click", onDocumentClick, true);
  }

  root.SoundManager = {
    init: init,
    play: play,
    ambient: {
      start: startAmbient,
      stop: stopAmbient
    },
    mute: function mute() { setEnabled(false); },
    unmute: function unmute() { setEnabled(true); },
    setEnabled: setEnabled,
    unlock: unlock,
    isEnabled: function isEnabled() { return enabled; }
  };
})(globalThis);
