"""
Generate Yala logo package with Mauritania colors and flag element.
Colors: Green #00A651, Gold #D4AF37, Dark Navy #08111F
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = "frontend/public"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mauritania colors
GREEN = "#00A651"
GOLD = "#D4AF37"
NAVY = "#08111F"
WHITE = "#FFFFFF"

GREEN_RGB = (0, 166, 81)
GOLD_RGB = (212, 175, 55)
NAVY_RGB = (8, 17, 31)
WHITE_RGB = (255, 255, 255)


def draw_crescent_star(draw, cx, cy, size, color):
    """Draw a simplified Mauritania crescent and star."""
    r = size // 2
    # Crescent: two overlapping circles
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    # Cut out inner circle (shifted up) to make crescent
    inner_r = int(r * 0.82)
    offset = int(r * 0.25)
    # We'll draw the crescent by drawing arcs instead
    # Simple approach: draw a filled circle, then overlay with background
    return


def draw_star(draw, cx, cy, size, color):
    """Draw a 5-pointed star."""
    import math
    points = []
    for i in range(5):
        angle = math.radians(-90 + i * 72)
        points.append((cx + size * math.cos(angle), cy + size * math.sin(angle)))
    # Connect every other point for star shape
    star_points = []
    for i in range(5):
        star_points.append(points[i])
        # Inner point
        angle = math.radians(-90 + i * 72 + 36)
        inner_r = size * 0.38
        star_points.append((cx + inner_r * math.cos(angle), cy + inner_r * math.sin(angle)))
    draw.polygon(star_points, fill=color)


def draw_mauritania_element(draw, cx, cy, size, color):
    """Draw crescent moon + star (Mauritania flag symbol)."""
    import math
    r = size
    # Crescent: outer circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    # Inner circle offset upward to create crescent
    inner_r = int(r * 0.8)
    draw.ellipse([cx - inner_r, cy - inner_r - int(r * 0.3),
                  cx + inner_r, cy + inner_r - int(r * 0.3)], fill=NAVY_RGB)
    # Star above crescent
    star_size = int(r * 0.3)
    draw_star(draw, cx, cy - int(r * 1.1), star_size, color)


def create_master_logo(size=512):
    """Create the main Yala logo."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin], fill=GREEN_RGB)

    # Mauritania element (crescent + star) in gold
    center = size // 2
    element_size = int(size * 0.18)
    draw_mauritania_element(draw, center, int(center * 0.55), element_size, GOLD_RGB)

    # "Y" letter stylized
    y_top = int(size * 0.42)
    y_bottom = int(size * 0.82)
    y_mid = int(size * 0.62)
    y_left = int(size * 0.28)
    y_right = int(size * 0.72)
    line_w = int(size * 0.06)

    # Left arm of Y
    draw.line([(y_left, y_top), (center, y_mid)], fill=WHITE_RGB, width=line_w)
    # Right arm of Y
    draw.line([(y_right, y_top), (center, y_mid)], fill=WHITE_RGB, width=line_w)
    # Stem of Y
    draw.line([(center, y_mid), (center, y_bottom)], fill=WHITE_RGB, width=line_w)

    # Round the joints
    joint_r = line_w // 2
    for point in [(y_left, y_top), (y_right, y_top), (center, y_mid), (center, y_bottom)]:
        draw.ellipse([point[0] - joint_r, point[1] - joint_r,
                      point[0] + joint_r, point[1] + joint_r], fill=WHITE_RGB)

    return img


def create_variant_logo(size, bg_color, accent_color, label_color, label_text):
    """Create a variant logo (Rider/Driver/Admin)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded square
    margin = int(size * 0.03)
    radius = int(size * 0.18)
    draw.rounded_rectangle([margin, margin, size - margin, size - margin],
                           radius=radius, fill=bg_color)

    # Mauritania element in accent color (smaller, top area)
    center = size // 2
    element_size = int(size * 0.12)
    draw_mauritania_element(draw, center, int(size * 0.22), element_size, accent_color)

    # "Y" letter
    y_top = int(size * 0.35)
    y_bottom = int(size * 0.65)
    y_mid = int(size * 0.50)
    y_left = int(size * 0.32)
    y_right = int(size * 0.68)
    line_w = int(size * 0.05)

    draw.line([(y_left, y_top), (center, y_mid)], fill=WHITE_RGB, width=line_w)
    draw.line([(y_right, y_top), (center, y_mid)], fill=WHITE_RGB, width=line_w)
    draw.line([(center, y_mid), (center, y_bottom)], fill=WHITE_RGB, width=line_w)

    joint_r = line_w // 2
    for point in [(y_left, y_top), (y_right, y_top), (center, y_mid), (center, y_bottom)]:
        draw.ellipse([point[0] - joint_r, point[1] - joint_r,
                      point[0] + joint_r, point[1] + joint_r], fill=WHITE_RGB)

    # Label text at bottom
    label_y = int(size * 0.72)
    try:
        font = ImageFont.truetype("arial.ttf", int(size * 0.1))
    except (OSError, IOError):
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), label_text, font=font)
    text_w = bbox[2] - bbox[0]
    draw.text(((size - text_w) // 2, label_y), label_text, fill=label_color, font=font)

    return img


def create_favicon(logo_img, size=32):
    """Create favicon from logo."""
    return logo_img.resize((size, size), Image.LANCZOS)


# Generate all logos
print("Generating Yala logo package...")

# Master logo
master = create_master_logo(512)
master.save(os.path.join(OUTPUT_DIR, "yala-logo.png"))
print("  ✓ yala-logo.png (512x512)")

# Logo 192 (PWA)
logo192 = master.resize((192, 192), Image.LANCZOS)
logo192.save(os.path.join(OUTPUT_DIR, "logo192.png"))
print("  ✓ logo192.png (192x192)")

# Logo 512 (PWA)
master.save(os.path.join(OUTPUT_DIR, "logo512.png"))
print("  ✓ logo512.png (512x512)")

# Favicon
favicon = master.resize((32, 32), Image.LANCZOS)
favicon.save(os.path.join(OUTPUT_DIR, "favicon.ico"), format="ICO", sizes=[(32, 32)])
print("  ✓ favicon.ico (32x32)")

# Yala Rider (Green background, gold accent)
rider = create_variant_logo(512, GREEN_RGB, GOLD_RGB, WHITE_RGB, "RIDER")
rider.save(os.path.join(OUTPUT_DIR, "yala-rider-logo.png"))
print("  ✓ yala-rider-logo.png (Green)")

# Yala Driver (Gold background, green accent)
driver = create_variant_logo(512, GOLD_RGB, GREEN_RGB, NAVY_RGB, "DRIVER")
driver.save(os.path.join(OUTPUT_DIR, "yala-driver-logo.png"))
print("  ✓ yala-driver-logo.png (Gold)")

# Yala Admin (Navy background, gold accent)
admin = create_variant_logo(512, NAVY_RGB, GOLD_RGB, WHITE_RGB, "ADMIN")
admin.save(os.path.join(OUTPUT_DIR, "yala-admin-logo.png"))
print("  ✓ yala-admin-logo.png (Navy)")

print("\nAll logos generated in frontend/public/")
