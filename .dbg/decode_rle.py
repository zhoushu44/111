# -*- coding: utf-8 -*-
"""Decode TEC gfx0 as PCX-style RLE bitstream -> PNG"""
from PIL import Image

data = open(r'C:\Users\zhou\Desktop\HSTIP_SHMQ\1', 'rb').read()
# payload after 20-byte header (blob starts at 55)
payload = data[75:9920]   # trim trailing CR LF

# PCX RLE: >=0xC0 -> count=(b&0x3F), repeat next byte; else literal
out = bytearray()
i = 0
while i < len(payload):
    b = payload[i]; i += 1
    if b >= 0xC0:
        cnt = b & 0x3F
        if i >= len(payload): break
        v = payload[i]; i += 1
        out.extend(bytes([v]) * cnt)
    else:
        out.append(b)

n = len(out)
print('decoded bytes:', n, '=> bits:', n*8)
print('candidates:')
for w in (268, 300, 400, 267, 615, 601, 508, 496):
    if n * 8 % w == 0:
        h = n * 8 // w
        print('  W=%d -> H=%d' % (w, h))
    else:
        import math
        h = n*8//w
        print('  W=%d -> H=%d (remnant %d bits)' % (w, h, n*8 - h*w))

def save(w, h, fname, msb=True):
    if w*h > n*8: return False
    img = Image.new('L', (w, h), 255)
    px = img.load()
    for y in range(h):
        for x in range(w):
            bp = y*w + x
            byte = out[bp >> 3]
            bit = (byte >> (7 - (bp & 7))) & 1 if msb else (byte >> (bp & 7)) & 1
            px[x, y] = 0 if bit else 255
    img.save(fname)
    print('saved', fname, w, 'x', h)
    return True

save(268, n*8//268 if n*8%268==0 else None or 300, r'C:\Users\zhou\Desktop\1116\.dbg\hstip_268.png')
save(300, 300, r'C:\Users\zhou\Desktop\1116\.dbg\hstip_300.png')
