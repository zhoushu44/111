# -*- coding: utf-8 -*-
# 精确测量图1 QR码位置和header/正文字高（限定x范围避免QR干扰行带）
from PIL import Image
import numpy as np

p1 = r'c:\Users\zhou\AppData\Roaming\Trae CN\User\workspaceStorage\07b903c0912a931ca17895f2010abec3\paste-files\989e32d3-c3e3-4021-ad0b-f111f93f279e_image.png'
gray = np.array(Image.open(p1).convert('L'))
H, W = gray.shape
pxmm = 361 / 70.0

# QR在右侧区域: x>240 找暗块
right = gray[:, 240:] < 100
rows = np.where(right.sum(axis=1) > 8)[0]
cols = np.where(right.sum(axis=0) > 8)[0]
print('QR bbox: y=%d..%d (h=%dpx, %.1fmm)  x=%d..%d (w=%dpx, %.1fmm)' % (
    rows[0], rows[-1], rows[-1]-rows[0]+1, (rows[-1]-rows[0]+1)/pxmm,
    240+cols[0], 240+cols[-1], cols[-1]-cols[0]+1, (cols[-1]-cols[0]+1)/pxmm))
print('QR右边距: %.1fmm  QR底边距: %.1fmm  QR顶y: %.1fmm' % (
    (W-1-(240+cols[-1]))/pxmm, (H-1-rows[-1])/pxmm, rows[0]/pxmm))

# header字高: x=90..283
hdr = gray[0:33, 90:284] < 110
r = np.where(hdr.sum(axis=1) > 2)[0]
print('header带: y=%d..%d h=%dpx %.2fmm' % (r[0], r[-1], r[-1]-r[0]+1, (r[-1]-r[0]+1)/pxmm))

# Item No行字高: x=32..185
it = gray[30:50, 32:186] < 110
r2 = np.where(it.sum(axis=1) > 2)[0]
print('ItemNo带: y=%d..%d h=%dpx %.2fmm' % (30+r2[0], 30+r2[-1], r2[-1]-r2[0]+1, (r2[-1]-r2[0]+1)/pxmm))

# Composition行
cp = gray[50:70, 32:330] < 110
r3 = np.where(cp.sum(axis=1) > 2)[0]
print('Compo带: y=%d..%d h=%dpx %.2fmm' % (50+r3[0], 50+r3[-1], r3[-1]-r3[0]+1, (r3[-1]-r3[0]+1)/pxmm))
