# 生成"最终对照"报告（单文件自包含 HTML）：线上 vs 改前 vs 改后。
#
# 用法：python -I tools/make-final2-report.py
import base64
import importlib.util
import os
import re

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location("mr", "tools/make-report.py")
mr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mr)

LIVE = ".cmp/livefinal"
BEFORE = ".cmp/final/local"
AFTER = ".cmp/after1/final"
SBS = ".cmp/after1/sbs"
OUT = ".cmp/Solar-Wanderer-最终对照.html"

FIGURES = [
    ("earth-space", "地球 · 深空（3.2R）"),
    ("sun-close", "太阳 · 2.2R"),
    ("earth-night", "地球 · 夜面（城市灯光 + 星空）"),
    ("earth-leo", "地球 · 400km 低轨"),
    ("jupiter-space", "木星 · 深空（两侧同一时刻重拍，几何一致）"),
    ("mars-space", "火星 · 深空"),
    ("moon-loworbit", "月球 · 300km 低轨"),
    ("saturn-rings-edge", "土星 · 环平面"),
]

SCENES = [
    "sun-close", "earth-space", "earth-leo", "earth-night", "mars-space",
    "jupiter-space", "saturn-rings-edge", "moon-loworbit", "moon-ground-horizon",
    "mercury-ground-horizon", "phobos-space", "enceladus-space",
    "io-space", "titan-ground-horizon", "mars-ground-horizon",
]


def metrics(path):
    if not os.path.exists(path):
        return None
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    g = a.mean(axis=2)
    black = 100.0 * (g < 8).mean()
    thr = max(np.percentile(g, 97), 60)
    m = g > thr
    if m.sum() < 100:
        return black, None, None, None
    d = a[m]
    mx, mn = d.max(axis=1), d.min(axis=1)
    return black, 100.0 * (mn > 230).mean(), 100.0 * ((mx - mn) / (mx + 1e-6)).mean(), float(g[m].mean())


def cell(x):
    if x is None:
        return "—"
    if x[1] is None:
        return "%.1f / — / — / —" % x[0]
    return "%.1f / %.1f / %.1f / %.0f" % (x[0], x[1], x[2], x[3])


rows = []
for n in SCENES:
    L = metrics(os.path.join(LIVE, n + ".png"))
    B = metrics(os.path.join(BEFORE, n + ".png"))
    A = metrics(os.path.join(AFTER, n + ".png"))
    if not (L and A):
        continue
    verdict = []
    if L[0] - A[0] > 10:
        verdict.append("背景偏亮")
    if L[1] is not None and A[1] is not None:
        if A[1] - L[1] > 5:
            verdict.append("盘面过白")
        if L[2] > 3 and A[2] < L[2] * 0.8:
            verdict.append("失色")
        if abs(A[3] / max(L[3], 1) - 1) > 0.25:
            verdict.append("亮度差%+.0f%%" % (100 * (A[3] / max(L[3], 1) - 1)))
    rows.append((n, cell(L), cell(B), cell(A), " ".join(verdict) or "ok"))

TABLE = "\n".join(
    "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td class='%s'>%s</td></tr>"
    % (n, l, b, a, "" if v == "ok" else "dn", v) for n, l, b, a, v in rows)

bad = [r for r in rows if r[4] != "ok"]

CSS = """
:root{--bg:#f6f7f9;--panel:#fff;--fg:#14171c;--muted:#5a6472;--line:#dfe3e9;--code:#eceff4;--bad:#b4451e;--good:#2c7551;
--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;--sans:"IBM Plex Sans","Noto Sans SC",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1015;--panel:#141920;--fg:#e5e9ef;--muted:#97a2b1;--line:#232b36;--code:#1a2029;--bad:#f08a5d;--good:#5fbf94;color-scheme:dark}}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);margin:0;padding:0 16px 64px;line-height:1.65;font-size:15.5px}
.wrap{max-width:1080px;margin:0 auto}
header{padding:40px 0 20px;border-bottom:1px solid var(--line)}
h1{font-size:clamp(25px,4.4vw,34px);line-height:1.2;margin:0 0 10px;letter-spacing:-.02em}
.lede{color:var(--muted);max-width:64ch;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:14px;font-family:var(--mono);font-size:12.5px;color:var(--muted)}
h2{font-size:20px;margin:40px 0 8px}h2 .n{font-family:var(--mono);color:var(--muted);margin-right:10px}
h3{font-size:16px;margin:24px 0 6px}
code{font-family:var(--mono);font-size:.9em;background:var(--code);padding:1px 5px;border-radius:4px}
figure{margin:14px 0}figure img{display:block;width:100%;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:12.5px;color:var(--muted);margin-top:6px;font-family:var(--mono)}
.tbl-wrap{overflow-x:auto;margin:14px 0;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{padding:6px 9px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:left}
th{color:var(--muted);font-size:11.5px;background:var(--code)}
td.dn{color:var(--bad)}
.note{border-left:2px solid var(--line);padding-left:14px;color:var(--muted);font-size:14px}
ul{margin:8px 0 12px;padding-left:20px}li{margin:5px 0}
.kpi{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 4px}
.kpi div{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 14px;font-family:var(--mono);font-size:13px}
"""

BODY = """
<header>
<h1>Solar Wanderer：最后一轮修复 · 线上 vs 改前 vs 改后</h1>
<p class="lede">线上已逐字节确认为 <code>c88ac40</code>（2026-07-03）。本轮针对"天体辨识度"与"背景干净度"做了五项修改，下面是同机位的三人对照。</p>
<div class="meta"><span>线上 <b>c88ac40</b></span><span>本地 <b>920ba2c + 本轮</b></span><span>测试 <b>320/320</b></span><span>机位 <b>30</b></span></div>
</header>

<h2><span class="n">1</span>五项修改</h2>

<h3>① 地球云层：云量图当成了不透明度</h3>
<p>2026-10-16 把合成云图换成了 NASA GIBS 的 <code>MODIS_Terra_Cloud_Fraction_Day</code>。那是<b>云量</b>（每格被云覆盖的面积比例，全球均值 0.72），不是云的厚度。当成不透明度喂进去，等于让 64% 的地表盖上 &gt;50% 不透明的白纱。</p>
<div class="kpi"><div>盘面近白 25.4% → <b>8.4%</b>（线上 2.0%）</div><div>平均饱和 2.4% → <b>10.6%</b>（线上 10.9%）</div><div>400km 近白 96.2% → <b>21.0%</b>（线上 18.3%）</div></div>
<p class="note">回落到合成云图 <code>earth_clouds.jpg</code>。要接真实云，必须换 <code>Cloud_Optical_Thickness</code> 一类<b>厚度</b>产品，云量只做遮罩。</p>

<h3>② 太阳米粒：逐像素归一化 + 写反的 LOD 门禁</h3>
<p>两处叠加，把日面结构全部抹掉：</p>
<ul>
<li><code>base = sampled * (0.85 / luminance)</code> —— 每个像素除以<b>自己的</b>亮度。数学上等于把贴图所有亮度结构清零，米粒、光斑、大尺度明暗差全部消失，只剩色相。</li>
<li>程序化米粒的门禁 <code>1.0 - smoothstep(0.35, 0.9, fp*700)</code> <b>写反了</b>：<code>fp*700</code> 是"一个米粒周期占几个像素"，而 1−smoothstep 在 x 大时返回 0，于是米粒只在<b>小于 0.35 像素</b>（已分辨不出）时才打开。2.2R 机位实测 <code>fp*700≈2.8</code> → 两层米粒恒为 0。</li>
</ul>
<p>改为<b>全图均值</b>归一（<code>uMapMean</code>，CPU 侧采样）+ 正向门禁（周期 ≥1px 淡入）。日冕另外从 6 倍日面亮度的灰雾收回到贴边淡冕。</p>

<h3>③ 银河：真实贴图被换掉了</h3>
<p>线上用 <code>milkyway.jpg</code> = 1,905,513 B；2026-09-30 被换成压暗版 530,143 B（均值 1.4 → 0.4），随后误判为"全黑图"改成程序化、材质色从 0.5 降到 0.34。本轮恢复原图，程序化只作兜底。</p>

<h3>④ 星点：软渐变 sprite → 硬点</h3>
<p>线上是<b>不带 map</b> 的 PointsMaterial（1–2 像素硬点）；本地是 32×32 径向渐变压到 1.7px，mipmap 平均后峰值对比度塌掉，读起来像噪点。改为硬点，尺寸对齐线上 3.4 / 2.6 / 1.4。另补一层 11,000 颗<b>极限星等之外</b>的暗星背景（按银道面集中），补足真实计数中肉眼看不见的那部分。</p>

<h3>⑤ 黄道光：一条绕黄道一圈的带 → 朝太阳的锥</h3>
<p>旧式 <code>band * (0.25 + 0.75*bright)</code> 里的 0.25 让黄道光在<b>背日方向仍有 25% 亮度</b>——真实比值 50:1 以上。相机基本都在黄道面附近，于是那条带横穿每一张太空图。改为平方衰减的锥，强度 0.020 → 0.0012。</p>

<h2><span class="n">2</span>三人对照表</h2>
<p>列格式：<code>背景近黑% / 盘面近白% / 盘面饱和% / 盘面均值</code>。改后与线上差距超阈值即标红。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>场景</th><th>线上</th><th>改前</th><th>改后</th><th>判定</th></tr></thead>
<tbody>
__TABLE__
</tbody></table></div>

<h2><span class="n">3</span>并排图（左＝线上，右＝本地改后）</h2>
__FIGURES__

<h2><span class="n">4</span>仍未解决（如实列出）</h2>
<ul>
<li><b>次要天体盘面过曝</b>：土卫七（Hyperion）整块盘面到 100% 近白、土卫二 26.6%（线上 12.3%）、木卫一 15.8%（线上 4.2%）。根因在"按反照率做的曝光适应"对高反照率冰体补偿过头，属于盘面亮度标定，本轮没动。</li>
<li><b>火星偏亮 32%、失色</b>（饱和 20.5% vs 线上 37.7%）：同样是曝光适应 + 分级色标叠加后把盘面推到 ACES 肩部。</li>
<li><b>土卫六地面</b>：天空发白、地面发黑。这一条<b>两侧时刻不同</b>（线上 10-18、本地 10-19，土卫六自转周期 15.9 天，太阳高度差很多），不能直接比；本地自身在低太阳高度下的雾色标定仍有问题。</li>
<li><b>土星环平面背景偏亮</b>：13.5% 近黑 vs 线上 55.5%。</li>
</ul>

<h2><span class="n">5</span>方法学说明（会影响怎么读这张表）</h2>
<ul>
<li>线上截图拍于 <b>2026-10-18</b>，本地改后拍于 <b>2026-10-19</b>。木星自转 9.9h、土星 10.7h，相隔一天相位完全随机——<b>木星/土星两侧已在 2026-10-19 12:39–12:40 重拍</b>（相差 1 分钟），表中用的是重拍结果。</li>
<li>线上 <code>hyperion-space</code> 那张实际拍到了地球（旧版 <code>orbit('hyperion', …)</code> 没有生效），<b>不可比，已从表中剔除</b>。</li>
<li>"盘面"用亮度 97 分位以上的连通区域近似。对<b>月牙相位</b>（木星这次两侧都是细月牙）会退化成"亮缘"，那一行的近白/饱和只能看趋势，不能当绝对值。</li>
</ul>
"""

FIG_HTML = "".join(
    '<figure><img src="img/%s.png" alt="%s"><figcaption>%s（%s）　左：线上　右：本地改后</figcaption></figure>'
    % (n, label, label, n) for n, label in FIGURES)

html = ("<title>Solar Wanderer 最终对照</title>\n<style>" + CSS + "</style>\n<div class=\"wrap\">\n"
        + BODY.replace("__TABLE__", TABLE).replace("__FIGURES__", FIG_HTML) + "\n</div>")


def data_uri(path):
    w, h, bpp, px = mr.read_png(path)
    return "data:image/png;base64," + base64.b64encode(mr.encode_png(w, h, bpp, px)).decode()


calls = [0]


def repl(m):
    p = os.path.join(SBS, m.group(1))
    if not os.path.exists(p):
        return m.group(0)
    calls[0] += 1
    return 'src="%s"' % data_uri(p)


html = re.sub(r'src="img/([^"]+)"', repl, html)
open(OUT, "w", encoding="utf-8").write(html)
print("写出 %s  %.2f MB  内联 %d 张" % (OUT, os.path.getsize(OUT) / 1048576, calls[0]))
print("未过门禁 %d 项：%s" % (len(bad), "、".join(r[0] for r in bad)))
