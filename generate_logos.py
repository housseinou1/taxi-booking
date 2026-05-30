"""
Yala Complete Branding Package Generator
Colors: Green #00A651, Gold #D4AF37, Navy #08111F, White #FFFFFF
Style: Modern flat design, Uber/Lyft inspired, Mauritania flag element
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUTPUT = "frontend/public"
os.makedirs(OUTPUT, exist_ok=True)

# Brand colors
GREEN = (0, 166, 81)
GOLD = (212, 175, 55)
NAVY = (8, 17, 31)
WHITE = (255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def star_points(cx, cy, outer_r, inner_r, points=5):
    """Generate 5-pointed star polygon coordinates."""
    pts = []
    for i in range(points * 2):
        angle = math.radians(-90 + i * 36)
        r = outer_r if i % 2 == 0 else inner_r
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def draw_crescent_star(draw, cx, cy, size, color, bg_color):
    """Draw Mauritania flag crescent + star."""
    r = size
    # Outer moon circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    # Inner cut (creates crescent) - shifted up
    cut_r = int(r * 0.78)
    cut_offset = int(r * 0.32)
    draw.ellipse([cx - cut_r, cy - cut_r - cut_offset,
                  cx + cut_r, cy + cut_r - cut_offset], fill=bg_color)
    # Star above
    star_r = int(r * 0.28)
    star_inner = int(star_r * 0.4)
    star_cy = cy - int(r * 1.15)
    pts = star_points(cx, star_cy, star_r, star_inner)
    draw.polygon(pts, fill=color)


def draw_y_letter(draw, cx, cy, size, color, weight):
    """Draw a bold stylized Y letter."""
    half = size // 2
    top_y = cy - half
    mid_y = cy
    bot_y = cy + half
    left_x = cx - int(half * 0.7)
    right_x = cx + int(half * 0.7)
    w = weight

    # Left arm
    draw.line([(left_x, top_y), (cx, mid_y)], fill=color, width=w)
    # Right arm
    draw.line([(right_x, top_y), (cx, mid_y)], fill=color, width=w)
    # Stem
    draw.line([(cx, mid_y), (cx, bot_y)], fill=color, width=w)
    # Round caps
    cap_r = w // 2
    for pt in [(left_x, top_y), (right_x, top_y), (cx, mid_y), (cx, bot_y)]:
        draw.ellipse([pt[0]-cap_r, pt[1]-cap_r, pt[0]+cap_r, pt[1]+cap_r], fill=color)


def create_master_logo(size=512):
    """Main Yala logo: green circle, white Y, gold crescent+star."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    m = int(size * 0.04)
    # Green circle background
    draw.ellipse([m, m, size-m, size-m], fill=GREEN)
    # Crescent + star in gold (top area)
    cs_size = int(size * 0.13)
    draw_crescent_star(draw, size//2, int(size*0.28), cs_size, GOLD, GREEN)
    # White Y letter (center-bottom)
    y_size = int(size * 0.28)
    draw_y_letter(draw, size//2, int(size*0.6), y_size, WHITE, int(size*0.055))
    return img


def create_rider_logo(size=512):
    """Yala Rider: green rounded square, white Y, gold accent."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    m = int(size * 0.03)
    r = int(size * 0.2)
    draw.rounded_rectangle([m, m, size-m, size-m], radius=r, fill=GREEN)
    # Crescent in gold
    cs_size = int(size * 0.11)
    draw_crescent_star(draw, size//2, int(size*0.24), cs_size, GOLD, GREEN)
    # White Y
    draw_y_letter(draw, size//2, int(size*0.55), int(size*0.24), WHITE, int(size*0.05))
    # "RIDER" label
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size*0.07))
    except (OSError, IOError):
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "RIDER", font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((size-tw)//2, int(size*0.78)), "RIDER", fill=WHITE, font=font)
    return img


def create_driver_logo(size=512):
    """Yala Driver: gold rounded square, navy Y, green accent."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    m = int(size * 0.03)
    r = int(size * 0.2)
    draw.rounded_rectangle([m, m, size-m, size-m], radius=r, fill=GOLD)
    # Crescent in green
    cs_size = int(size * 0.11)
    draw_crescent_star(draw, size//2, int(size*0.24), cs_size, GREEN, GOLD)
    # Navy Y
    draw_y_letter(draw, size//2, int(size*0.55), int(size*0.24), NAVY, int(size*0.05))
    # "DRIVER" label
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size*0.07))
    except (OSError, IOError):
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "DRIVER", font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((size-tw)//2, int(size*0.78)), "DRIVER", fill=NAVY, font=font)
    return img


def create_admin_logo(size=512):
    """Yala Admin: navy rounded square, gold Y, green accent."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    m = int(size * 0.03)
    r = int(size * 0.2)
    draw.rounded_rectangle([m, m, size-m, size-m], radius=r, fill=NAVY)
    # Crescent in gold
    cs_size = int(size * 0.11)
    draw_crescent_star(draw, size//2, int(size*0.24), cs_size, GOLD, NAVY)
    # White Y with gold tint
    draw_y_letter(draw, size//2, int(size*0.55), int(size*0.24), GOLD, int(size*0.05))
    # "ADMIN" label
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size*0.07))
    except (OSError, IOError):
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), "ADMIN", font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((size-tw)//2, int(size*0.78)), "ADMIN", fill=GOLD, font=font)
    return img


def create_navbar_logo(size=48):
    """Small navbar logo: green circle, white Y, no text."""
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    draw.ellipse([1, 1, size-2, size-2], fill=GREEN)
    # Small crescent
    cs = int(size * 0.1)
    draw_crescent_star(draw, size//2, int(size*0.25), cs, GOLD, GREEN)
    # Y
    draw_y_letter(draw, size//2, int(size*0.58), int(size*0.22), WHITE, max(2, int(size*0.06)))
    return img


def create_splash(width=1080, height=1920, bg=NAVY):
    """Splash screen with centered logo and slogan."""
    img = Image.new("RGBA", (width, height), bg)
    draw = ImageDraw.Draw(img)
    # Center logo
    logo_size = 280
    logo = create_master_logo(logo_size)
    x = (width - logo_size) // 2
    y = (height - logo_size) // 2 - 100
    img.paste(logo, (x, y), logo)
    # Slogan
    try:
        font = ImageFont.truetype("arialbd.ttf", 36)
        font_sm = ImageFont.truetype("arial.ttf", 24)
    except (OSError, IOError):
        font = ImageFont.load_default()
        font_sm = font
    slogan = "Fast. Safe. Local."
    bbox = draw.textbbox((0, 0), slogan, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((width-tw)//2, y + logo_size + 60), slogan, fill=WHITE, font=font)
    # Arabic tagline
    tagline = "Ride Anywhere"
    bbox2 = draw.textbbox((0, 0), tagline, font=font_sm)
    tw2 = bbox2[2] - bbox2[0]
    draw.text(((width-tw2)//2, y + logo_size + 110), tagline, fill=GOLD, font=font_sm)
    return img


# ─── Generate everything ──────────────────────────────────────────────────────
print("🎨 Generating Yala branding package...")
print()

# Master logo
master = create_master_logo(512)
master.save(f"{OUTPUT}/yala-logo.png")
print("  ✓ yala-logo.png (512x512 master)")

# PWA icons
master.resize((192, 192), Image.LANCZOS).save(f"{OUTPUT}/logo192.png")
print("  ✓ logo192.png (192x192 PWA)")
master.save(f"{OUTPUT}/logo512.png")
print("  ✓ logo512.png (512x512 PWA)")

# Favicon
master.resize((32, 32), Image.LANCZOS).save(f"{OUTPUT}/favicon.ico", format="ICO", sizes=[(32, 32)])
print("  ✓ favicon.ico (32x32)")

# Variant logos
rider = create_rider_logo(512)
rider.save(f"{OUTPUT}/yala-rider-logo.png")
print("  ✓ yala-rider-logo.png (green, rider)")

driver = create_driver_logo(512)
driver.save(f"{OUTPUT}/yala-driver-logo.png")
print("  ✓ yala-driver-logo.png (gold, driver)")

admin = create_admin_logo(512)
admin.save(f"{OUTPUT}/yala-admin-logo.png")
print("  ✓ yala-admin-logo.png (navy, admin)")

# Navbar logo (small)
nav = create_navbar_logo(96)
nav.save(f"{OUTPUT}/yala-nav-logo.png")
print("  ✓ yala-nav-logo.png (96x96 navbar)")

# Splash screens
splash = create_splash(1080, 1920, NAVY)
splash.save(f"{OUTPUT}/splash-screen.png")
print("  ✓ splash-screen.png (1080x1920)")

print()
print("✅ All branding assets generated!")
print("   Colors: Green #00A651 | Gold #D4AF37 | Navy #08111F")
print("   Slogan: Yala — Fast. Safe. Local.")
