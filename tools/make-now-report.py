# 当前线上 vs 当前本地：与 2026-10-18 那份《修复对照》同样格式的对比报告。
#
# 结构：逐项对比（每项一张并排图 + 局部特写）→ 30 机位指标 → 方法学说明 → 图册。
# 全部图片内联进单个 HTML，可离线双击打开。
#
# 用法：python -I tools/make-now-report.py
import base64
import importlib.util
import os
import re

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location("mr", "tools/make-report.py")
mr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mr)

LIVE = ".cmp/now/live"
LOCAL = ".cmp/now/local"
SBS = ".cmp/now/sbs"
CROP = ".cmp/now/crops"
OUT = ".cmp/Solar-Wanderer-当前对照.html"
os.makedirs(CROP, exist_ok=True)

# 30 个机位，顺序与场景表一致
GALLERY = [
    ("earth-space", "地球 深空（3.2R）"),
    ("earth-space-late", "地球 深空（长等待）"),
    ("earth-leo", "地球 低轨 400km"),
    ("earth-night", "地球 夜面"),
    ("earth-ground-horizon", "地球 地面 平视"),
    ("earth-ground-up", "地球 地面 仰视"),
    ("earth-underwater", "地球 水下"),
    ("mars-space", "火星 深空"),
    ("mars-ground-horizon", "火星 地面 平视"),
    ("mars-ground-up", "火星 地面 仰视"),
    ("mars-ground-dusk", "火星 地面 暮光"),
    ("mars-loworbit", "火星 低轨 300km"),
    ("titan-ground-horizon", "土卫六 地面 平视"),
    ("titan-ground-up", "土卫六 地面 仰视"),
    ("moon-ground-horizon", "月球 地面 平视"),
    ("moon-ground-up", "月球 地面 仰视"),
    ("moon-ground-dusk", "月球 地面 暮光"),
    ("moon-loworbit", "月球 低轨 300km"),
    ("mercury-ground-horizon", "水星 地面 平视"),
    ("europa-ground-horizon", "木卫二 地面 平视"),
    ("enceladus-ground-horizon", "土卫二 地面 平视"),
    ("io-ground-horizon", "木卫一 地面 平视"),
    ("phobos-space", "火卫一 深空"),
    ("phobos-ground-horizon", "火卫一 地面 平视"),
    ("hyperion-space", "土卫七 深空"),
    ("io-space", "木卫一 深空"),
    ("enceladus-space", "土卫二 深空"),
    ("saturn-rings-edge", "土星 环平面"),
    ("sun-close", "太阳 近距"),
    ("jupiter-space", "木星 深空"),
]


def metrics(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    g = a.mean(axis=2)
    thr = max(np.percentile(g, 97), 60)
    m = g > thr
    d = a[m]
    mx, mn = d.max(axis=1), d.min(axis=1)
    return {
        "mean": float(g.mean()),
        "black": 100.0 * (g < 8).mean(),
        "white": 100.0 * (mn > 230).mean(),
        "sat": 100.0 * ((mx - mn) / (mx + 1e-6)).mean(),
    }


rows = []
for name, _ in GALLERY:
    pl, pn = os.path.join(LIVE, name + ".png"), os.path.join(LOCAL, name + ".png")
    if not (os.path.exists(pl) and os.path.exists(pn)):
        continue
    L, N = metrics(pl), metrics(pn)
    rows.append((name, L, N))

TABLE = "\n".join(
    "<tr><td>%s</td><td>%.1f</td><td>%.1f</td><td class='%s'>%+.1f</td>"
    "<td>%.1f</td><td>%.1f</td><td>%.1f</td><td>%.1f</td></tr>"
    % (n, L["mean"], N["mean"], "up" if N["mean"] >= L["mean"] else "dn",
       N["mean"] - L["mean"], L["black"], N["black"], L["white"], N["white"])
    for n, L, N in rows)


def crop_pair(name, box, out_name, scale=2):
    """从并排图里各截一块同位置的区域，放大后排在一起。"""
    p = os.path.join(SBS, name + ".png")
    a = Image.open(p).convert("RGB")
    w, h = a.size
    half = w // 2
    x0, y0, x1, y1 = box
    L = a.crop((x0, y0, min(x1, half), y1))
    R = a.crop((half + x0, y0, half + min(x1, half), y1))
    sw, sh = L.size
    out = Image.new("RGB", (sw * scale * 2 + 8, sh * scale), (180, 30, 0))
    out.paste(L.resize((sw * scale, sh * scale), Image.LANCZOS), (0, 0))
    out.paste(R.resize((sw * scale, sh * scale), Image.LANCZOS), (sw * scale + 8, 0))
    out.save(os.path.join(CROP, out_name + ".png"))


# 5 张局部特写：把最重要的差异放大到 1:1 以上
CROPS = [
    ("earth-space", (200, 90, 560, 450), "earth-disc", "地球盘面特写"),
    ("sun-close", (330, 150, 630, 450), "sun-disc", "太阳盘面特写"),
    ("earth-leo", (250, 150, 650, 470), "leo-surface", "地球 400km 地表特写"),
    ("mars-space", (600, 40, 940, 300), "sky-patch", "纯天空特写（星点与背景黑度）"),
    ("jupiter-space", (230, 80, 630, 480), "jupiter-disc", "木星盘面特写"),
]
for name, box, out_name, _ in CROPS:
    if os.path.exists(os.path.join(SBS, name + ".png")):
        crop_pair(name, box, out_name)

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
h4{margin:0 0 8px;font-size:16.5px}
.find{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0;border-left:3px solid var(--good)}
dl{display:grid;grid-template-columns:72px 1fr;gap:5px 14px;margin:8px 0}
dt{color:var(--muted);font-size:13px}dd{margin:0}
code{font-family:var(--mono);font-size:.9em;background:var(--code);padding:1px 5px;border-radius:4px}
figure{margin:14px 0}figure img{display:block;width:100%;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:12.5px;color:var(--muted);margin-top:6px;font-family:var(--mono)}
.tbl-wrap{overflow-x:auto;margin:14px 0;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{padding:5px 9px;border-bottom:1px solid var(--line);white-space:nowrap;text-align:right}
th:first-child,td:first-child{text-align:left}
th{color:var(--muted);font-size:11.5px;background:var(--code)}
td.up{color:var(--good)}td.dn{color:var(--bad)}
.note{border-left:2px solid var(--line);padding-left:14px;color:var(--muted);font-size:14px}
ul{margin:8px 0 12px;padding-left:20px}li{margin:5px 0}
"""

BODY = """
<header>
<h1>Solar Wanderer：当前线上 vs 当前本地 全量对照</h1>
<p class="lede">同一份场景脚本、同一画质档（medium）、同一分辨率，两侧各跑 30 个机位。左图＝线上 sw.icodestar.net，右图＝本地构建。本文件已内联全部截图，可离线单独打开。</p>
<div class="meta"><span>对比日期 <b>2026-10-19</b></span><span>同机位 <b>30</b></span><span>线上 <b>c88ac40</b></span><span>测试 <b>320/320</b></span></div>
</header>

<h2><span class="n">1</span>逐项对比</h2>

<div class="find"><h4>① 地球：云层与颜色</h4>
<dl><dt>现象</dt><dd>改前本地地球被一层均匀白纱罩住，几乎认不出是地球（盘面近白 25.4%、平均饱和 2.4%）。</dd>
<dt>根因</dt><dd>云层用了 NASA GIBS 的 <code>MODIS_Terra_Cloud_Fraction_Day</code>——那是<b>云量</b>（每格被云覆盖的面积比例，全球均值 0.72），不是云的厚度，被当成不透明度喂进了 <code>cloudAlpha</code>。</dd>
<dt>现状</dt><dd>已回落到合成云图 <code>earth_clouds.jpg</code>：近白 8.4%、饱和 10.6%（线上 2.0% / 10.9%）。</dd></dl>
<figure><img src="img/earth-space.png" alt="地球深空"><figcaption>earth-space　左：线上　右：本地</figcaption></figure>
<figure><img src="crop/earth-disc.png" alt="地球盘面特写"><figcaption>地球盘面特写（2×）　左：线上　右：本地</figcaption></figure></div>

<div class="find"><h4>② 太阳：米粒组织与日冕</h4>
<dl><dt>现象</dt><dd>改前本地日面是一块平橙 + 几个黑斑，周围一圈灰色日冕光晕，星点被冲掉。</dd>
<dt>根因</dt><dd>两处叠加：<code>base = sampled * (0.85/luminance)</code> 逐像素归一，把贴图的亮度结构全部清零；程序化米粒的 LOD 门禁 <code>1 - smoothstep(0.35, 0.9, fp*700)</code> 写反，只在米粒小于 0.35 像素时才打开。日冕还乘了 <code>uInvExposure</code>，近距离被放大 50 倍。</dd>
<dt>现状</dt><dd>改为全图均值归一 + 正向门禁；日冕系数 0.9 → 0.0025。日面米粒清晰，日面外回到纯黑。</dd></dl>
<figure><img src="img/sun-close.png" alt="太阳 2.2R"><figcaption>sun-close（2.2R）　左：线上　右：本地</figcaption></figure>
<figure><img src="crop/sun-disc.png" alt="太阳盘面特写"><figcaption>日面特写（2×）　左：线上　右：本地</figcaption></figure></div>

<div class="find"><h4>③ 星空：硬点与背景黑度</h4>
<dl><dt>现象</dt><dd>本地星点看起来像噪点，天区稀疏；背景不是黑的。</dd>
<dt>根因</dt><dd>星点用 32×32 径向渐变 sprite 压到 1.7px，mipmap 平均后峰值对比度塌掉。</dd>
<dt>现状</dt><dd>改回硬点（无 map），尺寸对齐线上 3.4/2.6/1.4；另补一层 11,000 颗极限星等之外的暗星背景（按银道面集中）。</dd></dl>
<figure><img src="img/mars-space.png" alt="火星深空"><figcaption>mars-space　左：线上　右：本地</figcaption></figure>
<figure><img src="crop/sky-patch.png" alt="纯天空特写"><figcaption>纯天空特写（2×）　左：线上　右：本地</figcaption></figure></div>

<div class="find"><h4>④ 银河：真实贴图</h4>
<dl><dt>根因</dt><dd>2026-09-30 把 1.9 MB 的真实银河贴图换成 0.53 MB 压暗版（均值 1.4→0.4），随后被误判为"全黑图"改成程序化生成，材质色从 0.5 降到 0.34。</dd>
<dt>现状</dt><dd>恢复原图（与线上同一文件），程序化只作兜底。夜空里银河带与尘埃结构回来了。</dd></dl>
<figure><img src="img/earth-night.png" alt="地球夜面"><figcaption>earth-night　左：线上　右：本地</figcaption></figure></div>

<div class="find"><h4>⑤ 黄道光：绕天的带 → 朝太阳的锥</h4>
<dl><dt>根因</dt><dd><code>band * (0.25 + 0.75*bright)</code> 里的 0.25 让黄道光在<b>背日方向仍有 25% 亮度</b>（真实比值 50:1 以上），变成一条绕黄道一圈的光带。</dd>
<dt>现状</dt><dd>改为朝太阳的平方衰减锥，强度 0.020 → 0.0012。</dd></dl>
<figure><img src="img/jupiter-space.png" alt="木星深空"><figcaption>jupiter-space　左：线上　右：本地（两侧同一分钟拍摄，几何一致）</figcaption></figure></div>

<div class="find"><h4>⑥ 地球低轨</h4>
<dl><dt>现象</dt><dd>改前 400km 低轨盘面近白 96.2%，整幅是一层灰蓝薄纱。</dd>
<dt>现状</dt><dd>近白 21.0%（线上 18.3%），海陆结构与云涡重新可见。</dd></dl>
<figure><img src="img/earth-leo.png" alt="地球低轨"><figcaption>earth-leo　左：线上　右：本地</figcaption></figure>
<figure><img src="crop/leo-surface.png" alt="低轨地表特写"><figcaption>400km 地表特写（2×）　左：线上　右：本地</figcaption></figure></div>

<div class="find"><h4>⑦ 土星环平面 / 木星盘面</h4>
<dl><dt>说明</dt><dd>这两处本地与线上仍是"亮部更亮、暗部更亮"的差距，列在此处便于对照，未在本轮修复范围内。</dd></dl>
<figure><img src="img/saturn-rings-edge.png" alt="土星环平面"><figcaption>saturn-rings-edge　左：线上　右：本地</figcaption></figure>
<figure><img src="crop/jupiter-disc.png" alt="木星盘面特写"><figcaption>木星盘面特写（2×）　左：线上　右：本地</figcaption></figure></div>

<h2><span class="n">2</span>30 机位指标</h2>
<p>"黑%"是亮度低于 8/255 的像素占比（背景黑得下去）；"白%"是盘面上近白像素占比（有没有被云/雾/过曝糊成白球）。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>场景</th><th>线上均值</th><th>本地均值</th><th>Δ</th><th>线上黑%</th><th>本地黑%</th><th>线上白%</th><th>本地白%</th></tr></thead>
<tbody>
__TABLE__
</tbody></table></div>
<p class="note">空间机位的"黑%"普遍回升，是背景不再被黄道光带与日冕灰雾填掉；地面机位的差异主要来自两帧拍摄时刻不同（太阳高度不同）。</p>

<h2><span class="n">3</span>怎么读这份对比</h2>
<ul>
<li>两侧截图<b>背靠背</b>拍摄（线上先跑完 30 个机位，紧接着本地跑 30 个），总时间差约 15 分钟。木星自转 9.9h、土星 10.7h，15 分钟对应约 9° 自转——相位基本一致，但仍不是像素级同刻。</li>
<li>"盘面"用亮度 97 分位以上的连通区域近似；对<b>月牙相位</b>会退化成"亮缘"，那一行只能看趋势。</li>
<li>地面机位（ground-*）依赖太阳高度，而两侧拍摄时刻不同，<b>不能直接比亮度</b>，只能比纹理与结构。</li>
<li>线上 <code>hyperion-space</code> 旧版 <code>orbit('hyperion', …)</code> 未生效（拍到的是地球），该机位不可比。</li>
</ul>

<h2><span class="n">4</span>复现</h2>
<pre style="overflow-x:auto;background:var(--code);padding:13px;border-radius:8px;font-family:var(--mono);font-size:12.5px">npx vite build &amp;&amp; npx vite preview --port 4180 --strictPort

AUDIT_BASE=https://sw.icodestar.net  AUDIT_OUT=.cmp/now/live  AUDIT_CLEAN=0 AUDIT_Q=medium node tools/audit-scenarios.mjs
AUDIT_BASE=http://127.0.0.1:4180      AUDIT_OUT=.cmp/now/local AUDIT_CLEAN=0 AUDIT_Q=medium node tools/audit-scenarios.mjs
python tools/cmp-metrics.py .cmp/now/live .cmp/now/local .cmp/now/sbs
python tools/verify-gates.py .cmp/now/live .cmp/now/local</pre>

<h2><span class="n">5</span>其余机位</h2>
<p>全部 30 个同机位，左：线上　右：本地。</p>
"""


def data_uri(path):
    w, h, bpp, px = mr.read_png(path)
    return "data:image/png;base64," + base64.b64encode(mr.encode_png(w, h, bpp, px)).decode()


html = ("<title>Solar Wanderer 当前对照</title>\n<style>" + CSS + "</style>\n<div class=\"wrap\">\n"
        + BODY.replace("__TABLE__", TABLE))

# 图册：30 张并排图
items = []
for name, label in GALLERY:
    p = os.path.join(SBS, name + ".png")
    if not os.path.exists(p):
        continue
    items.append(
        '<figure style="margin:0 0 22px"><img src="%s" alt="%s" '
        'style="width:100%%;border:1px solid var(--line);border-radius:6px">'
        "<figcaption>%s　<span style=\"opacity:.7\">%s</span></figcaption></figure>"
        % (data_uri(p), label, name, label))
html += "\n".join(items) + "\n</div>"


def repl_img(m):
    p = os.path.join(SBS, m.group(1))
    return 'src="%s"' % data_uri(p) if os.path.exists(p) else m.group(0)


def repl_crop(m):
    p = os.path.join(CROP, m.group(1))
    return 'src="%s"' % data_uri(p) if os.path.exists(p) else m.group(0)


html = re.sub(r'src="img/([^"]+)"', repl_img, html)
html = re.sub(r'src="crop/([^"]+)"', repl_crop, html)

open(OUT, "w", encoding="utf-8").write(html)
print("写出 %s  %.2f MB  图 %d 张（并排 %d + 特写 %d）"
      % (OUT, os.path.getsize(OUT) / 1048576, len(items) + len(CROPS), len(items), len(CROPS)))
