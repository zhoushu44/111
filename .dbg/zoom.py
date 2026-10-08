# -*- coding: utf-8 -*-
# 放大两张照片便于精确比对版式
from PIL import Image

p1 = r'c:\Users\zhou\AppData\Roaming\Trae CN\User\workspaceStorage\07b903c0912a931ca17895f2010abec3\paste-files\989e32d3-c3e3-4021-ad0b-f111f93f279e_image.png'
p2 = r'c:\Users\zhou\AppData\Roaming\Trae CN\User\workspaceStorage\07b903c0912a931ca17895f2010abec3\paste-files\a5cdad7f-d90b-4783-aa15-8e68382a3b2f_image.png'

for src, dst in [(p1, r'c:\Users\zhou\Desktop\1116\.dbg\zoom1.png'),
                 (p2, r'c:\Users\zhou\Desktop\1116\.dbg\zoom2.png')]:
    im = Image.open(src).convert('L')
    w, h = im.size
    im.resize((w * 3, h * 3), Image.LANCZOS).save(dst)
    print(dst, w * 3, h * 3)
