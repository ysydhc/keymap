from PIL import Image, ImageDraw

# Raycast requires 512x512 PNGs
def make_solid_icon(filename, color):
    img = Image.new('RGBA', (512, 512), color=(0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Draw a solid rounded rectangle
    d.rounded_rectangle([0, 0, 512, 512], radius=112, fill=color)
    
    # Draw a simple white circle in the middle just to have something
    d.ellipse([156, 156, 356, 356], fill=(255, 255, 255, 255))
    
    img.save(filename)

make_solid_icon('assets/icon-main-v4.png', (255, 100, 100, 255)) # Red
make_solid_icon('assets/icon-km-v4.png', (100, 255, 100, 255))   # Green
make_solid_icon('assets/icon-kb-v4.png', (100, 100, 255, 255))   # Blue
