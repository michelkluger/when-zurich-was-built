import sys, os, threading, functools, http.server
from playwright.sync_api import sync_playwright

# Usage: python scripts/export.py <frames_dir> <worker> <workers>
# Renders src/video.html frame by frame (30 fps) to PNGs. Run several workers in parallel.
out, k, K = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
FPS = 30
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(out, exist_ok=True)

# The page fetches ../docs/*, which file:// URLs block, so serve the repo over local HTTP.
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    # GPU WebGL is ~45x faster than software for the 3D frames; set GL=swiftshader on machines without a usable GPU
    gl = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if os.environ.get("GL") == "swiftshader" else ["--use-angle=d3d11", "--enable-gpu"]
    b = p.chromium.launch(channel=os.environ.get("PW_CHANNEL", "msedge"), args=gl + ["--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 540, "height": 675}, device_scale_factor=2, color_scheme="dark")
    pg.set_default_timeout(180_000)  # software WebGL with several workers is slow; 3D frames can take a while
    pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/src/video.html")
    pg.wait_for_function("window.__ready === true")
    n = int(pg.evaluate("window.__duration") * FPS)
    # split the frames still missing; rerun the same command to fill any gap left by a crashed worker
    todo = [i for i in range(n) if not os.path.exists(f"{out}/f{i:05d}.png")]
    for i in todo[k::K]:
        pg.evaluate(f"window.__seek({i / FPS})")
        pg.screenshot(path=f"{out}/f{i:05d}.png")  # viewport == card (540x675); no element-stability wait
    b.close()
srv.shutdown()
print(f"worker {k}: frames done")
