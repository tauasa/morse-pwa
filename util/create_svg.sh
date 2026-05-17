# Generate the SVG icons programmatically (192 and 512 px)
python3 << 'EOF'
import os

os.makedirs('../icons', exist_ok=True)

def make_icon_svg(size):
    """Vintage-style morse icon: amber dot-dash on dark background."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%">
      <stop offset="0%" stop-color="#1a1400"/>
      <stop offset="100%" stop-color="#0d0d0d"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="{size*0.015}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="{size}" height="{size}" rx="{size*0.18}" fill="url(#bg)"/>
  <!-- Outer amber ring -->
  <rect x="{size*0.06}" y="{size*0.06}" width="{size*0.88}" height="{size*0.88}"
        rx="{size*0.14}" fill="none" stroke="#e8a020" stroke-width="{size*0.018}" opacity="0.3"/>
  <!-- Morse: · − − (W) centered -->
  <g filter="url(#glow)" fill="#e8a020">
    <!-- dot -->
    <circle cx="{size*0.28}" cy="{size*0.5}" r="{size*0.058}"/>
    <!-- dash 1 -->
    <rect x="{size*0.38}" y="{size*0.454}" width="{size*0.14}" height="{size*0.092}" rx="{size*0.03}"/>
    <!-- dash 2 -->
    <rect x="{size*0.56}" y="{size*0.454}" width="{size*0.14}" height="{size*0.092}" rx="{size*0.03}"/>
  </g>
  <!-- MORSE label -->
  <text x="{size*0.5}" y="{size*0.73}" text-anchor="middle"
        font-family="serif" font-size="{size*0.105}" letter-spacing="{size*0.025}"
        fill="#e8a020" opacity="0.8">MORSE</text>
</svg>'''

for sz in [192, 512]:
    svg = make_icon_svg(sz)
    # Write as SVG (rename to .png for browsers that accept SVG icons, 
    # or convert separately)
    with open(f'../icons/icon-{sz}.svg', 'w') as f:
        f.write(svg)
    print(f"icon-{sz}.svg written")
EOF
