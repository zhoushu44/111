# -*- coding: utf-8 -*-
"""Dump structure of TPCL print stream from HSTIP"""
import sys, binascii

data = open(r'C:\Users\zhou\Desktop\HSTIP_SHMQ\1', 'rb').read()
print('total length:', len(data))

# find all STX (0x02) control positions
print('\n=== STX command map ===')
i = 0
while True:
    p = data.find(b'\x02', i)
    if p < 0:
        break
    seg = data[p+1:p+16]
    print(p, repr(seg))
    i = p + 1

# find graphic command
idx = data.find(b'ICPgfx0')
print('\nICPgfx0 at offset:', idx)
print('\n=== first 64 bytes after ICPgfx0 ===')
print(binascii.hexlify(data[idx+7:idx+7+64]).decode())
print(repr(data[idx+7:idx+7+64]))
print('\n=== last 32 bytes after ICPgfx0 region (around next command) ===')
# next STX after ICPgfx0
nxt = data.find(b'\x02', idx)
print('next STX at:', nxt)
print(repr(data[nxt-32:nxt+32]))
