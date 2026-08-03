import os
import subprocess

game_dir = r"C:\Users\18320\.codex\worktrees\49c5\忍不住化身一条固执的鱼\game"

# 需要压缩的音频文件
audio_files = [
    "assets/sfx/interaction/fish-swim.mp3",
    "assets/sfx/ambient/gentle-stream.mp3",
    "assets/music/upbeat-loop.mp3",
    "assets/sfx/ambient/bubbles.wav"
]

for rel_path in audio_files:
    path = os.path.join(game_dir, rel_path)
    if not os.path.exists(path):
        print(f"Not found: {path}")
        continue
        
    print(f"Processing audio: {path}")
    temp_out = path + ".temp.mp3"
    try:
        # 使用 ffmpeg 压缩为低码率 (48k)
        ffmpeg_exe = r"C:\Users\18320\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"
        subprocess.run([
            ffmpeg_exe, "-y", "-i", path, 
            "-b:a", "48k", 
            "-ac", "1", # 单声道
            temp_out
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # 替换原文件
        os.replace(temp_out, path)
        print("  -> Compressed to 48kbps MP3")
    except Exception as e:
        print(f"  Error: {e}")
        if os.path.exists(temp_out):
            os.remove(temp_out)