# -*- coding: utf-8 -*-
"""Analyze TEC ICPgfx0 blob: find row pitch & RLE structure"""
import binascii

data = open(r'C:\Users\zhou\Desktop\HSTIP_SHMQ\1', 'rb').read()
blob = data[55:9922]   # graphics payload incl. 20-byte header
hdr, payload = blob[:20], blob[20:]
print('blob len', len(blob), 'payload len', len(payload))
print('hdr:', binascii.hexlify(hdr).decode())

print('\n=== payload first 256 bytes hex ===')
for i in range(0, 256, 32):
    print('%04x' % i, binascii.hexlify(payload[i:i+32]).decode())

print('\n=== payload last 128 bytes hex ===')
n = len(payload)
for i in range(n-128, n, 32):
    print('%04x' % i, binascii.hexlify(payload[i:i+32]).decode())

# autocorrelation: equality ratio for lag
print('\n=== autocorrelation (equality ratio, lag 1..120) ===')
best = []
seg = payload[32:2000]
for lag in range(1, 121):
    m = sum(1 for i in range(len(seg)-lag) if seg[i] == seg[i+lag])
    r = m / float(len(seg)-lag)
    best.append((r, lag))
best.sort(reverse=True)
for r, lag in best[:12]:
    print('lag %3d  ratio %.3f' % (lag, r))

# byte histogram
print('\n=== top bytes ===')
from collections import Counter
c = Counter(payload)
for b, n_ in c.most_common(12):
    print('0x%02x  %d' % (b, n_))
