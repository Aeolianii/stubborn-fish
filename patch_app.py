import os

file_path = r"C:\Users\18320\.codex\worktrees\49c5\忍不住化身一条固执的鱼\game\js\app.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = """  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("images")) {
          request.result.createObjectStore("images");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }"""

new_str = """  function openDatabase() {
    return new Promise((resolve) => {
      try {
        if (!("indexedDB" in window)) {
          resolve(null);
          return;
        }
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("images")) {
            request.result.createObjectStore("images");
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => {
          console.warn("indexedDB open error", e);
          resolve(null);
        };
      } catch (err) {
        console.warn("indexedDB not supported or threw error", err);
        resolve(null);
      }
    });
  }"""

content = content.replace(old_str, new_str)

# Also let's show the real error on screen instead of a generic message
old_err_str = """    } catch (error) {
      console.error(error);
      showError("鱼缸启动时遇到问题，请重启试试吧。");
    }"""
new_err_str = """    } catch (error) {
      console.error(error);
      showError("鱼缸启动时遇到问题: " + (error ? error.message : "未知错误"));
    }"""
content = content.replace(old_err_str, new_err_str)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Modification complete.")