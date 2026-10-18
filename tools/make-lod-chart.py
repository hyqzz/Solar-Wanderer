# 生成掠飞视频底部的"抖动示波器"长条图（1440×250）：
# 上格 = 线上，下格 = 本地，画的是逐帧竖直位移的**去基线残差**，
# 也就是把匀速掠过扣掉之后剩下的地形错动。尖峰 = LOD 重建造成的跳变。
# 用法：python -I tools/make-lod-chart.py <线上帧目录> <本地帧目录> <输出PNG>
import importlib.util
import sys

import numpy as np

spec = importlib.util.spec_from_file_location("az", "tools/analyze-lod-flyby.py")
az = importlib.util.module_from_spec(spec)
spec.loader.exec_module(az)

live_d, local_d, out = sys.argv[1], sys.argv[2], sys.argv[3]
dl, rl, sl, _ = az.compute(live_d)
dlc, rlc, slc, _ = az.compute(local_d)
az.report("live", dl, rl, sl)
az.report("local", dlc, rlc, slc)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

W, H = 1440, 250
BG = "#0d1015"
fig = plt.figure(figsize=(W / 100, H / 100), dpi=100, facecolor=BG)
gs = fig.add_gridspec(2, 1, hspace=0.55, left=0.062, right=0.995, top=0.86, bottom=0.15)
lim = max(1.2, float(np.abs(rl).max()) * 1.18, float(np.abs(rlc).max()) * 1.18)
for idx, (res, sp, name, col) in enumerate([
        (rl, sl, "LIVE  sw.icodestar.net", "#7fb0e3"),
        (rlc, slc, "LOCAL  main", "#f08a5d")]):
    ax = fig.add_subplot(gs[idx], facecolor="#141920")
    x = np.arange(len(res))
    ax.axhline(0, color="#4a5464", lw=0.7)
    ax.fill_between(x, res, 0, color=col, alpha=0.26, lw=0)
    ax.plot(x, res, color=col, lw=1.0)
    if len(sp):
        ax.scatter(sp, res[sp], s=18, color="#ffd166", zorder=5)
    ax.set_ylim(-lim, lim)
    ax.set_xlim(0, len(res) - 1)
    ax.set_ylabel("px", fontsize=8, color="#97a2b1")
    ax.tick_params(labelsize=7, colors="#97a2b1")
    for s in ax.spines.values():
        s.set_color("#232b36")
    ax.grid(alpha=0.18, lw=0.4, color="#3a4453")
    ax.set_title(f"{name}    residual std {res.std():.2f}px    max {np.abs(res).max():.2f}px"
                 f"    burst frames {len(sp)}", fontsize=9, loc="left", pad=3, color="#c9d3df")
    if idx == 0:
        ax.set_xticklabels([])
    else:
        ax.set_xlabel("frame (25 fps)", fontsize=8, color="#97a2b1")

fig.savefig(out, facecolor=BG)
print("图 →", out)
