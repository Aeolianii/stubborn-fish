import os
from PIL import Image

game_dir = r"C:\Users\18320\.codex\worktrees\49c5\忍不住化身一条固执的鱼\game"

# 要压缩的大文件列表
large_pngs = [
    "assets/aquarium-background.png",
    "assets/aquarium-background-westlake-v2.png",
    "assets/default-fish-atlas.png",
    "assets/surface-plants-atlas.png",
    "assets/plants.png",
    "assets/default-decor-atlas.png",
    "assets/fish-atlas.png",
    "assets/rocks.png"
]

for rel_path in large_pngs:
    path = os.path.join(game_dir, rel_path)
    if not os.path.exists(path):
        print(f"Not found: {path}")
        continue
        
    print(f"Processing: {path}")
    try:
        img = Image.open(path)
        
        # 将背景图直接转为 JPEG (无透明度)，其余保持 PNG 但减小尺寸或颜色
        if "background" in path:
            rgb_img = img.convert('RGB')
            # 缩放至 70%
            new_size = (int(img.width * 0.7), int(img.height * 0.7))
            rgb_img = rgb_img.resize(new_size, Image.Resampling.LANCZOS)
            rgb_img.save(path, "JPEG", quality=80)
            print(f"  -> Converted to JPEG and resized")
        else:
            # 透明素材缩放至 75%
            new_size = (int(img.width * 0.75), int(img.height * 0.75))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            img.save(path, "PNG", optimize=True)
            print(f"  -> Resized and optimized PNG")
    except Exception as e:
        print(f"  Error: {e}")