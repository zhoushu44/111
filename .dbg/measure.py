# -*- coding: utf-8 -*-
# 测量两张标签照片的文字行高/行距/边距/QR位置
# 图1 = HSTIP 原版（目标版式），图2 = 当前程序输出（字号常量已知，当标尺）
import sys
from PIL import Image
import numpy as np

def load_gray(path):
    im = Image.open(path).convert('L')
    return np.array(im)

def label_bbox(gray):
    # 标签是亮色区域，背景偏暗；找亮像素包围盒
    mask = gray > 140
    cols = mask.sum(axis=0)
    rows = mask.sum(axis=1)
    xs = np.where(cols > gray.shape[0] * 0.3)[0]
    ys = np.where(rows > gray.shape[1] * 0.3)[0]
    return xs[0], ys[0], xs[-1], ys[-1]

def text_bands(gray, bbox, dark_thresh=110, min_frac=0.01):
    # 在标签范围内找暗色文字行带
    x0, y0, x1, y1 = bbox
    sub = gray[y0:y1 + 1, x0:x1 + 1]
    dark = sub < dark_thresh
    rowcnt = dark.sum(axis=1)
    w = sub.shape[1]
    bands = []
    in_band = False
    for y, c in enumerate(rowcnt):
        on = c > w * min_frac
        if on and not in_band:
            start = y
            in_band = True
        elif not on and in_band:
            bands.append((start, y - 1))
            in_band = False
    if in_band:
        bands.append((start, len(rowcnt) - 1))
    out = []
    for (a, b) in bands:
        band = dark[a:b + 1]
        colcnt = band.sum(axis=0)
        xs = np.where(colcnt > 0)[0]
        out.append({
            'y0': a, 'y1': b, 'h': b - a + 1,
            'x0': int(xs[0]) if len(xs) else -1,
            'x1': int(xs[-1]) if len(xs) else -1,
        })
    return out

def report(path, name, ref_font=None):
    gray = load_gray(path)
    bb = label_bbox(gray)
    lw = bb[2] - bb[0] + 1
    lh = bb[3] - bb[1] + 1
    print('==== %s ====  图像%dx%d  标签bbox=%s  标签宽%dpx 高%dpx' % (name, gray.shape[1], gray.shape[0], bb, lw, lh))
    pxmm = lw / 70.0
    print('  比例: %.3f px/mm' % pxmm)
    bands = text_bands(gray, bb)
    prev = None
    for i, b in enumerate(bands):
        mm_h = b['h'] / pxmm
        pitch = (b['y0'] - prev['y0']) if prev else 0
        mm_pitch = pitch / pxmm
        print('  行%02d: y=%4d..%4d 高=%3dpx(%.2fmm) x=%4d..%4d 行距=%3dpx(%.2fmm)' % (
            i, b['y0'], b['y1'], b['h'], mm_h, b['x0'], b['x1'], pitch, mm_pitch))
        prev = b
    return pxmm, bands

if __name__ == '__main__':
    p1 = r'c:\Users\zhou\AppData\Roaming\Trae CN\User\workspaceStorage\07b903c0912a931ca17895f2010abec3\paste-files\989e32d3-c3e3-4021-ad0b-f111f93f279e_image.png'
    p2 = r'c:\Users\zhou\AppData\Roaming\Trae CN\User\workspaceStorage\07b903c0912a931ca17895f2010abec3\paste-files\a5cdad7f-d90b-4783-aa15-8e68382a3b2f_image.png'
    report(p1, '图1 HSTIP原版')
    print()
    report(p2, '图2 当前程序')
