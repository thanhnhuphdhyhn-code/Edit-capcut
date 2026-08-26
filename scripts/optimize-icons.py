from pathlib import Path

from PIL import Image


ROOT = Path("/home/ubuntu/piper-tts-viet-editor/assets/images")
FILES = ["icon.png", "splash-icon.png", "favicon.png", "android-icon-foreground.png"]

for filename in FILES:
    target = ROOT / filename
    image = Image.open(target).convert("RGBA")
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    optimized = image.quantize(colors=256, method=Image.Quantize.FASTOCTREE).convert("RGBA")
    optimized.save(target, format="PNG", optimize=True, compress_level=9)
    print(f"{filename}: {target.stat().st_size} bytes")
