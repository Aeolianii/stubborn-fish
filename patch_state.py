import os

file_path = r"C:\Users\18320\.codex\worktrees\49c5\忍不住化身一条固执的鱼\game\js\state-store.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = """  function createStateStore(options) {
    const config = options || {};
    const storage = config.storage || root.localStorage || createMemoryStorage();
    const now = typeof config.now === "function" ? config.now : Date.now;"""

new_str = """  function getSafeLocalStorage() {
    try {
      if (typeof root.localStorage !== "undefined") {
        root.localStorage.setItem("__test__", "1");
        root.localStorage.removeItem("__test__");
        return root.localStorage;
      }
    } catch (e) {
      // Ignore
    }
    return createMemoryStorage();
  }

  function createStateStore(options) {
    const config = options || {};
    const storage = config.storage || getSafeLocalStorage();
    const now = typeof config.now === "function" ? config.now : Date.now;"""

content = content.replace(old_str, new_str)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Modification complete.")