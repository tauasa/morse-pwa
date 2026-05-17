# Convert SVGs to PNGs using Python's built-in capabilities or cairosvg
python3 -c "import cairosvg; print('cairosvg available')" 2>/dev/null || \
python3 -c "
# Fallback: create minimal valid PNG using struct+zlib
import struct, zlib, os

def make_png(size, outpath):
    # Simple solid-color PNG as placeholder
    # Dark background #0d0d0d with amber text is complex to encode;
    # we'll create a minimal valid PNG the browser can use
    
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xFFFFFFFF)
    
    # RGBA pixels: dark bg with amber dot
    rows = []
    cx, cy, r = size//2, size//2, size//8
    for y in range(size):
        row = b'\x00'  # filter type
        for x in range(size):
            dx, dy = x - cx, y - cy
            if dx*dx + dy*dy <= r*r:
                row += bytes([0xe8, 0xa0, 0x20, 0xff])  # amber
            elif (size*0.06 < x < size*0.94 and size*0.06 < y < size*0.94):
                row += bytes([0x14, 0x14, 0x14, 0xff])  # surface
            else:
                row += bytes([0x0d, 0x0d, 0x0d, 0xff])  # bg
        rows.append(row)
    
    raw = b''.join(rows)
    compressed = zlib.compress(raw, 9)
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)  # RGB
    # Actually RGBA: color type 6
    ihdr_data = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])
    
    png = header
    png += chunk(b'IHDR', ihdr_data)
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')
    
    with open(outpath, 'wb') as f:
        f.write(png)
    print(f'Created {outpath} ({len(png)} bytes)')

make_png(192, '../icons/icon-192.png')
make_png(512, '../icons/icon-512.png')
"