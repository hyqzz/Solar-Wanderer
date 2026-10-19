# 太空画面"干净度/辨识度"门禁：对同机位的 线上 / 本地 两组截图逐张算指标。
#
# 这组指标是 2026-10-19 那一轮总结出来的——此前的验收只看"暗像素占比"和
# "纹理能量"，两者都无法区分"星点回来了"和"背景被填灰了"，于是把一次观感退化
# 当成了修复。这里拆成四个互相独立的量：
#
#   近黑%    亮度 < 8/255 的像素占比        → 背景是不是黑得下去（照片感的地基）
#   近白%    盘面上 min(RGB) > 230 的占比    → 天体是不是被过曝/云/雾糊成白球
#   饱和%    盘面平均 (max-min)/max          → 天体还有没有颜色（地球变白球的反面）
#   盘面均值 盘面平均亮度                    → 与线上同机位的亮度比
#
# 用法：python -I tools/verify-gates.py <线上目录> <本地目录>
import os
import sys

import numpy as np
from PIL import Image

live_d, local_d = sys.argv[1], sys.argv[2]

SCENES = [
    "sun-close", "earth-space", "earth-leo", "earth-night", "mars-space",
    "jupiter-space", "saturn-rings-edge", "moon-loworbit", "moon-ground-horizon",
    "mercury-ground-horizon", "phobos-space", "enceladus-space", "hyperion-space",
    "io-space", "titan-ground-horizon", "mars-ground-horizon",
]


def metrics(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    g = a.mean(axis=2)
    near_black = 100.0 * (g < 8).mean()
    thr = max(np.percentile(g, 97), 60)
    m = g > thr
    if m.sum() < 100:
        return near_black, None, None, None
    d = a[m]
    mx, mn = d.max(axis=1), d.min(axis=1)
    near_white = 100.0 * (mn > 230).mean()
    sat = 100.0 * ((mx - mn) / (mx + 1e-6)).mean()
    return near_black, near_white, sat, float(g[m].mean())


print("%-24s | %-23s | %-23s | %s" % ("场景", "线上 黑%/白%/饱和/亮度", "本地 黑%/白%/饱和/亮度", "判定"))
print("-" * 100)
bad = []
for name in SCENES:
    pl = os.path.join(live_d, name + ".png")
    pn = os.path.join(local_d, name + ".png")
    if not (os.path.exists(pl) and os.path.exists(pn)):
        continue
    L, N = metrics(pl), metrics(pn)
    flags = []
    if L[0] - N[0] > 10:
        flags.append("背景偏亮")
    if L[1] is not None and N[1] is not None:
        if N[1] - L[1] > 5:
            flags.append("盘面过白")
        if L[2] > 3 and N[2] < L[2] * 0.8:
            flags.append("失色")
        if abs(N[3] / max(L[3], 1) - 1) > 0.25:
            flags.append("亮度差%+.0f%%" % (100 * (N[3] / max(L[3], 1) - 1)))
    if flags:
        bad.append((name, flags))

    def fmt(x):
        return ("%5.1f %5.1f %5.1f %6.1f" % (x[0], x[1], x[2], x[3])
                if x[1] is not None else "%5.1f   -     -     -   " % x[0])
    print("%-24s | %s | %s | %s" % (name, fmt(L), fmt(N), " ".join(flags) or "ok"))

print()
if bad:
    print("未过门禁 %d 项：" % len(bad))
    for n, f in bad:
        print("  -", n, "：", "，".join(f))
else:
    print("全部通过门禁。")
