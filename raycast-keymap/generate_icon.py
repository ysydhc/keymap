from PIL import Image, ImageDraw, ImageFont

def make_icon(filename, text, color):
    img = Image.new('RGBA', (512, 512), color=(40, 40, 40, 255))
    d = ImageDraw.Draw(img)
    # Draw a simple rounded rectangle or just text
    # We don't have a guaranteed font, so we'll just draw some shapes
    if text == "km":
        # Terminal prompt
        d.text((100, 150), ">_", fill=color, font_size=200)
    else:
        # Book shape
        d.rectangle([100, 100, 400, 400], outline=color, width=30)
        d.line([250, 100, 250, 400], fill=color, width=30)
    
    img.save(filename)

make_icon('assets/km-icon.png', 'km', (100, 255, 100, 255))
make_icon('assets/kb-icon.png', 'kb', (100, 200, 255, 255))
make_icon('assets/command-icon.png', 'km', (255, 100, 100, 255))
