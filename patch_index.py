import os

file_path = r"C:\Users\18320\.codex\worktrees\49c5\忍不住化身一条固执的鱼\game\index.html"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_str = '  <link rel="stylesheet" href="./styles.css">\n</head>'
new_str = '''  <link rel="stylesheet" href="./styles.css">
  <script>
    // 一进入互动空间立即强制横屏
    if (typeof tt !== 'undefined' && tt.setDeviceOrientation) {
      tt.setDeviceOrientation({
        value: 'landscape',
        success: function() { console.log('强制横屏成功'); },
        fail: function(err) { console.warn('强制横屏失败', err); }
      });
    }
  </script>
</head>'''

content = content.replace(old_str, new_str)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Modification complete.")
