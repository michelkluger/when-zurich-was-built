import sys, os, subprocess, imageio_ffmpeg

# Usage: python scripts/encode.py <frames_dir> <out_prefix>
frames, out = sys.argv[1], sys.argv[2]
n = len([f for f in os.listdir(frames) if f.endswith(".png")])
gap = next((i for i in range(n) if not os.path.exists(f"{frames}/f{i:05d}.png")), None)
if gap is not None:  # ffmpeg would silently stop at the first gap
    sys.exit(f"frame f{gap:05d}.png is missing; rerun scripts/export.py first")
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
ff = imageio_ffmpeg.get_ffmpeg_exe()
pat = f"{frames}/f%05d.png"
# MP4: 1080x1350 (4:5, fills the LinkedIn feed), 30 fps
subprocess.run([ff, "-y", "-framerate", "30", "-i", pat, "-vf", "format=yuv420p",
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", f"{out}.mp4"], check=True)
# GIF for the README: every 3rd frame (10 fps), 360 px wide
vf = "select='not(mod(n\\,3))',setpts=N/10/TB,scale=360:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle"
subprocess.run([ff, "-y", "-i", pat, "-vf", vf, "-r", "10", f"{out}.gif"], check=True)
