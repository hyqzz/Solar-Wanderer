# LOD 掠飞帧序列的量化分析：逐帧估计地形的**竖直位移**，把 LOD 重建造成的
# 跳变从"匀速平移"里分离出来。
#
# 原理：相机以恒定角速度掠过，地形在画面里是近似匀速流动的。LOD 重建时锚点重新
# 吸附，采样网格整体平移，表现为地形突然上下错动一格。所以逐帧求"使相邻两帧
# 地形带最匹配的竖直偏移 dy"，再用中值滤波取基线，残差里的尖峰就是跳变。
#
# 用法：python -I tools/analyze-lod-flyby.py <帧目录> [标题] [输出PNG]
import os
import sys

import numpy as np
from PIL import Image

# 只取地形带：上边留出天空（星点会污染匹配），下边避开极近景
Y0, Y1 = 170, 430
X0, X1 = 0, 720
MAXDY = 8


def compute(d, max_frames=None):
    """返回 (帧间竖直位移 dys, 去基线残差 resid, 尖峰下标 spikes)。"""
    files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    if max_frames:
        files = files[:max_frames]
    if len(files) < 3:
        raise SystemExit("帧数不足: " + d)
    frames = []
    for f in files:
        a = np.asarray(Image.open(os.path.join(d, f)).convert("L"), dtype=np.float32)
        frames.append(a[Y0:Y1, X0:X1])
    n = len(frames)
    H = frames[0].shape[0]

    def score(prev, cur, dy):
        if dy >= 0:
            a, b = prev[dy:H, :], cur[0:H - dy, :]
        else:
            a, b = prev[0:H + dy, :], cur[-dy:H, :]
        return float(np.abs(a - b).mean())

    dys = []
    for i in range(n - 1):
        sc = [score(frames[i], frames[i + 1], k) for k in range(-MAXDY, MAXDY + 1)]
        k = int(np.argmin(sc))
        if 0 < k < len(sc) - 1:
            y0, y1, y2 = sc[k - 1], sc[k], sc[k + 1]
            den = y0 - 2 * y1 + y2
            sub = 0.5 * (y0 - y2) / den if abs(den) > 1e-9 else 0.0
        else:
            sub = 0.0
        dys.append(k - MAXDY + sub)
    dys = np.array(dys)
    # 基线：11 帧中值（匀速平移是慢变分量）
    base = np.array([np.median(dys[max(0, i - 5):i + 6]) for i in range(len(dys))])
    resid = dys - base
    mad = np.median(np.abs(resid - np.median(resid))) or 1e-6
    z = (resid - np.median(resid)) / (1.4826 * mad)
    spikes = np.where(np.abs(z) > 4)[0]
    return dys, resid, spikes, base


def report(title, dys, resid, spikes):
    print(f"{title}")
    print(f"  帧数 {len(dys) + 1}  帧间竖直位移 中位数 {np.median(dys):+.2f}px  标准差 {dys.std():.2f}px")
    print(f"  残差(去基线) 标准差 {resid.std():.2f}px  最大 {np.abs(resid).max():.2f}px")
    print(f"  跳变尖峰(|z|>4) {len(spikes)} 处: " +
          ", ".join(f"f{i}→{i+1}({resid[i]:+.2f}px)" for i in spikes[:24]))


def main():
    d = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else d
    out_png = sys.argv[3] if len(sys.argv) > 3 else None
    dys, resid, spikes, base = compute(d)
    report(title, dys, resid, spikes)

    if out_png:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(9, 3.1), dpi=130)
        ax.axhline(0, color="#999", lw=0.8)
        ax.plot(dys, color="#2f6098", lw=1.1, label="frame-to-frame vertical shift (px)")
        ax.plot(base, color="#c98a2a", lw=1.1, ls="--", label="steady pan baseline (median)")
        ax.scatter(spikes, resid[spikes], s=26, color="#b4451e", zorder=5,
                   label=f"jitter spikes x{len(spikes)}")
        ax.set_xlabel("frame")
        ax.set_ylabel("px")
        ax.set_title(title, fontsize=10)
        ax.legend(fontsize=8, loc="upper right")
        ax.grid(alpha=0.25, lw=0.5)
        fig.tight_layout()
        fig.savefig(out_png)
        print("  图 →", out_png)


if __name__ == "__main__":
    main()
