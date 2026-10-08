# -*- coding: utf-8 -*-
"""Decode TEC ICPgfx bitmap -> PNG. Try TEC run-length graphic format.
Header: 05 01 01 00 00 00 00 01 02 0c 01 2c 01 2c 01 00 00 00 ff ff
  w=0x012c=300 h=0x012c=300
Payload: TEC B-SA4T raster uses per-row RLE: each row starts with a byte = number
of runs; then run bytes: value 0x00-0x7F = repeat count (white/black alternating),
0x80-0xFF = literal pixels.
We instead brute-force test known TEC formats.
"""
import struct
from PIL import Image

data = open(r'C:\Users\zhou\Desktop\HSTIP_SHMQ\1', 'rb').read()
payload = data[75:9922]
W, H = 300, 300

def try_plain_bits():
    """Assume payload is a bitstream, MSB-first, W*H bits = 90000 bits = 11250 bytes.
    payload is 9847 — too short, but rows may be RLE'd."""
    pass

# Strategy: TEC 'ICP' format for B-SA4T: data is row-based.
# Each row: 1 byte count N (number of data bytes), then N bytes of pixel data
# packed MSB-first, row padded to byte. 300 px = 37.5 -> 38 bytes/row.
# Check: 300 rows * (1 + 38) = 11700 > 9847. Not it.

# Try: variable-length: row header = 2 bytes (little endian length)?
# Let's just scan for structure: walk rows with 1-byte len; verify total.

def walk_1bytelen(payload, W, H):
    bpr = (W + 7) // 8
    pos = 0
    rows = []
    for y in range(H):
        if pos >= len(payload): return None
        n = payload[pos]; pos += 1
        if pos + n > len(payload): return None
        rows.append(payload[pos:pos+n]); pos += n
    return rows, pos

r = walk_1bytelen(payload, W, H)
if r is None:
    print('1-byte-len walk failed')
else:
    rows, pos = r
    print('1-byte-len OK, consumed', pos, 'of', len(payload))
    print('row0 len', len(rows[0]), 'row1 len', len(rows[1]))

# Try TEC RLE: 1 byte count + runs where high bit = literal?
def walk_rle(payload, W, H):
    pos = 0
    rows = []
    for y in range(H):
        if pos >= len(payload): return None
        nruns = payload[pos]; pos += 1
        bits = []
        color = 1  # start white
        for i in range(nruns):
            if pos >= len(payload): return None
            b = payload[pos]; pos += 1
            if b & 0x80:
                cnt = (b & 0x7F)
                # literal: next cnt bits? ambiguous
                bits.extend([0]*cnt)
            else:
                bits.extend([color]*b)
                color = 1 - color
        rows.append(bits)
    return rows, pos

# alternative: bits directly packed; total bits W*H; but len mismatch by 1403.
# diff might be trailing padding. 11250-9847=1403. Check if payload+padding works:
def try_packed():
    bits_needed = W*H
    avail = len(payload)*8
    print('packed: need', bits_needed, 'bits, have', avail, '=> short', bits_needed-avail)
    if avail < bits_needed: return None
    img = Image.new('1', (W, H), 1)
    px = img.load()
    bitpos = 0
    for y in range(H):
        for x in range(W):
            byte = payload[bitpos >> 3]
            bit = (byte >> (7 - (bitpos & 7))) & 1
            px[x, y] = 0 if bit else 1  # 1=black in '1' mode
            bitpos += 1
    return img

img = try_packed()
if img:
    img.save(r'C:\Users\zhou\Desktop\1116\.dbg\hstip_packed.png')
    print('saved packed attempt (likely corrupted tail)')
