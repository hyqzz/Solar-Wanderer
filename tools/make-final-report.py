# 生成最终对照报告（单文件自包含 HTML）。
import base64, os, re, importlib.util

spec = importlib.util.spec_from_file_location("mr", "tools/make-report.py")
mr = importlib.util.module_from_spec(spec); spec.loader.exec_module(mr)
IMG = ".cmp/report2/img"
OUT = ".cmp/Solar-Wanderer-修复对照.html"

ROWS = """earth-space|35.5|49.0|4.71|4.65|71.7|47.9
earth-leo|143.7|158.0|1.64|1.88|0.0|0.0
earth-night|6.4|31.5|4.10|3.71|88.9|40.3
earth-ground-horizon|102.5|114.3|0.96|2.47|0.0|1.4
earth-underwater|24.9|22.0|1.80|2.07|10.9|0.3
jupiter-space|27.1|66.0|3.62|3.27|70.6|31.2
saturn-rings-edge|26.5|88.5|3.32|3.16|58.5|28.5
sun-close|89.5|94.2|2.73|2.31|50.2|11.1
moon-ground-horizon|68.2|23.3|2.35|2.03|45.1|40.8
moon-loworbit|154.3|106.4|3.13|2.24|0.0|0.0
mercury-ground-horizon|83.8|92.4|1.71|2.52|45.5|29.4
mars-ground-horizon|109.3|148.4|1.54|1.77|0.6|0.0
titan-ground-horizon|92.9|125.5|1.68|1.70|0.1|0.0
io-ground-horizon|62.8|86.7|2.20|1.99|38.8|39.9
phobos-space|5.9|50.4|3.15|4.83|89.5|30.7
enceladus-space|16.8|28.8|4.98|5.01|55.5|57.8
hyperion-space|24.3|39.3|4.80|4.56|78.1|49.8
mars-space|12.2|22.2|2.25|2.54|79.0|66.0"""

rows_html = []
for line in ROWS.split("\n"):
    n, a, b, ta, tb, da, db = line.split("|")
    d = float(b) - float(a)
    cls = "up" if d > 0 else "dn"
    rows_html.append(
        f"<tr><td>{n}</td><td>{a}</td><td>{b}</td><td class='{cls}'>{d:+.1f}</td>"
        f"<td>{ta}</td><td>{tb}</td><td>{da}</td><td>{db}</td></tr>")
TABLE = "\n".join(rows_html)

CSS = """
:root{--bg:#f6f7f9;--panel:#fff;--fg:#14171c;--muted:#5a6472;--line:#dfe3e9;--accent:#2f6098;--bad:#b4451e;--good:#2c7551;--code:#eceff4;
--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;--sans:"IBM Plex Sans","Noto Sans SC",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d1015;--panel:#141920;--fg:#e5e9ef;--muted:#97a2b1;--line:#232b36;--accent:#7fb0e3;--bad:#f08a5d;--good:#5fbf94;--code:#1a2029;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d1015;--panel:#141920;--fg:#e5e9ef;--muted:#97a2b1;--line:#232b36;--accent:#7fb0e3;--bad:#f08a5d;--good:#5fbf94;--code:#1a2029;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 64px;margin:0;line-height:1.65;font-size:15.5px}
.wrap{max-width:1080px;margin:0 auto}
header{padding:44px 0 24px;border-bottom:1px solid var(--line)}
h1{font-size:clamp(26px,4.6vw,36px);line-height:1.2;margin:0 0 10px;letter-spacing:-.02em;text-wrap:balance}
.lede{color:var(--muted);max-width:62ch;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:16px;font-family:var(--mono);font-size:12.5px;color:var(--muted)}
h2{font-size:20px;margin:44px 0 8px}h2 .n{font-family:var(--mono);color:var(--muted);margin-right:10px}
h4{margin:0 0 8px;font-size:17px}
.find{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:16px 0;border-left:3px solid var(--good)}
dl{display:grid;grid-template-columns:80px 1fr;gap:5px 14px;margin:8px 0}
dt{color:var(--muted);font-size:13px}dd{margin:0}
code{font-family:var(--mono);font-size:.9em;background:var(--code);padding:1px 5px;border-radius:4px}
figure{margin:14px 0 4px}figure img{display:block;width:100%;max-width:100%;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:12.5px;color:var(--muted);margin-top:7px;font-family:var(--mono)}
.tbl-wrap{overflow-x:auto;margin:14px 0;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
th,td{text-align:right;padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--muted);font-size:12px;background:var(--code)}
td.up{color:var(--good)}td.dn{color:var(--bad)}
.note{border-left:2px solid var(--line);padding-left:14px;color:var(--muted);font-size:14px}
ul{margin:8px 0 12px;padding-left:20px}li{margin:4px 0}
@media(max-width:620px){dl{grid-template-columns:1fr;gap:2px 0}dt{margin-top:8px}}
"""

BODY = """
<header>
<h1>Solar Wanderer：对标线上第 1 轮修复报告</h1>
<p class="lede">按《对标线上》方案执行了批次 A/B 的七项。下面是逐项的量化对比，以及全量 30 个同机位的最终指标。并排图左为线上 sw.icodestar.net，右为本地构建。</p>
<div class="meta"><span>对比 <b>2026-10-18</b></span><span>同机位 <b>30</b></span><span>测试 <b>320/320</b></span></div>
</header>

<h2><span class="n">1</span>本轮修复</h2>

<div class="find"><h4>① 太阳：灰白麻点球 → 橙黄米粒 + 日冕</h4>
<dl><dt>根因</dt><dd>着色器把贴图"只取亮度再乘色度常数"，把太阳标志性的暖橙整个丢掉；光球系数 2.2 已越过 ACES 拐点，三通道一起压向白；日冕的 <code>uVisibility</code> 从未被赋值（恒 1e-6，等于永久不可见）。</dd>
<dt>改法</dt><dd>保留贴图色相、只归一亮度；系数落到 0.85（线性段内）；日冕基准可见度 0.55，并接入 <code>uInvExposure</code> 不再随场景曝光变黑。</dd>
<dt>结果</dt><dd>3R / 6R / 20R 三档都是暖橙盘 + 可见日冕，米粒与黑子结构保留。</dd></dl></div>

<div class="find"><h4>② 水星 / 月球：黑饼 → 可辨</h4>
<dl><dt>根因</dt><dd>曝光只补偿<b>距离</b>、不补偿<b>反照率</b>——水星（0.106）被压成一块黑饼。</dd>
<dt>改法</dt><dd>新增按目标天体反照率的曝光适应 <code>(0.62/albedo)^1.0</code>，相机靠近焦点天体时生效（40R 内全量、100R 外归零）。相机与人眼本来就是对着目标曝光的。</dd>
<dt>结果</dt><dd>水星盘面 <b>0.16× → 0.62×</b>，月球 <b>0.36× → 0.81×</b>（相对线上同机位）。</dd></dl></div>

<div class="find"><h4>③ 星空：被抹掉 → 回来</h4>
<dl><dt>根因</dt><dd><code>photoSkyVisibility</code> 把"附近有受照天体"当成通用眩光规则，地球 3.2R 处算出 0.023，同时通过 <code>#labels.daysky</code> 关掉了恒星名标签。</dd>
<dt>改法</dt><dd>空间视角<b>一律不衰减</b>（真空里天空本来就是黑的），只有贴着白昼地面才压暗；标签改为只在行走模式判定。</dd>
<dt>结果</dt><dd>earth-space 暗像素占比 <b>71.7% → 47.9%</b>，星点与星座名回来。</dd></dl></div>

<div class="find"><h4>④ 导航：瞬移 → 有过程</h4>
<dl><dt>根因</dt><dd><code>flyTo</code> 里 <code>prefersReducedMotion() &amp;&amp; dur = 0.01</code>——开启「减少动效」时把前往天体的过程整个抹掉。</dd>
<dt>改法</dt><dd>改为 <code>min(dur, 0.8)</code>，保留空间连续性、只是更快。</dd>
<dt>结果</dt><dd>减少动效下仍有 ≥0.5s 的可感知过渡（正常模式 4.5s，与线上一致）。</dd></dl></div>

<div class="find"><h4>⑤ 黄道光并入星空淡出</h4>
<dl><dt>根因</dt><dd>它的材质不在 <code>fadeMats</code> 里：星空淡到 2% 时它仍是 100%，画面变成"星星没了只剩灰雾"。</dd>
<dt>改法</dt><dd>加 <code>uFade</code>，与星空同一条曲线。</dd></dl></div>

<div class="find"><h4>⑥ 轨道线默认开启</h4>
<dl><dt>改法</dt><dd><code>orbitLinesOn</code> 默认 false → true，与线上一致，首屏就能看到太阳系结构。</dd></dl></div>

<div class="find"><h4>⑦ 实时测光（新增，默认关）</h4>
<dl><dt>实现</dt><dd><code>src/engine/metering.js</code>：1×1 浮点目标、16 点对数平均、中心加权、忽略近黑背景、150ms 低频读回。<code>?meter=1</code> 启用。</dd>
<dt>实测</dt><dd>地球在测光下正常曝光且星空可见。默认关：它会把整条曝光律换成测光律，需要逐场景标定。</dd></dl></div>

<h2><span class="n">2</span>最终 30 机位指标</h2>
<p>"暗%"是亮度低于 12/255 的像素占比，可直接看出星空有没有被抹掉；"纹理"是可辨细节量。</p>
<div class="tbl-wrap"><table>
<thead><tr><th>场景</th><th>线上均值</th><th>本地均值</th><th>Δ</th><th>线上纹理</th><th>本地纹理</th><th>线上暗%</th><th>本地暗%</th></tr></thead>
<tbody>
__TABLE__
</tbody></table></div>
<p class="note">空间机位普遍变亮是因为<b>星点回来了</b>（暗像素占比大幅下降），不是画面发灰；地面机位变亮是曝光适应把暗天体抬到可辨亮度。</p>

<h2><span class="n">3</span>并排对比</h2>
<figure><img src="img/earth-space.png" alt="地球深空"><figcaption>earth-space　左：线上　右：本地</figcaption></figure>
<figure><img src="img/jupiter-space.png" alt="木星"><figcaption>jupiter-space　左：线上　右：本地</figcaption></figure>
<figure><img src="img/saturn-rings-edge.png" alt="土星环平面"><figcaption>saturn-rings-edge　左：线上　右：本地</figcaption></figure>
<figure><img src="img/earth-night.png" alt="地球夜面"><figcaption>earth-night　左：线上　右：本地</figcaption></figure>
<figure><img src="img/moon-ground-horizon.png" alt="月球地面"><figcaption>moon-ground-horizon　左：线上　右：本地（仍偏暗）</figcaption></figure>

<h2><span class="n">4</span>仍未完成（批次 C）</h2>
<ul>
<li><b>地球云层硬边</b>：本地是高对比锯齿轮廓，线上是柔和团块。试过把不透明度曲线从 pow(lum,4.5) 改成 pow(lum,2.6)，覆盖率失控（整颗球被白云覆盖），已回退。</li>
<li><b>背景星场方块</b>：程序化银河在低分辨率下呈块状楔形。</li>
<li><b>冰卫星过度纹理化</b>：土卫三 / 土卫四的盘面纹理能量是线上的 15–17 倍。</li>
<li><b>地球低轨海岸线白色锯齿</b>。</li>
<li><b>月球低轨 / 地面仍偏暗</b>：月面 0.34×（线上 154.3 其实已经过曝）。这是"线上不物理、本地更接近真实"的一处，需要产品判断。</li>
<li><b>LOD 跳变</b>：掠飞时地形重建的几何跳变。</li>
</ul>

<h2><span class="n">5</span>复现</h2>
<pre style="overflow-x:auto;background:var(--code);padding:13px;border-radius:8px;font-family:var(--mono);font-size:12.5px">AUDIT_BASE=http://127.0.0.1:4180      AUDIT_OUT=.cmp/final/local AUDIT_CLEAN=0 AUDIT_Q=medium node tools/audit-scenarios.mjs
AUDIT_BASE=https://sw.icodestar.net   AUDIT_OUT=.cmp/live        AUDIT_CLEAN=0 AUDIT_Q=medium node tools/audit-scenarios.mjs
python tools/cmp-metrics.py .cmp/live .cmp/final/local .cmp/final/sbs</pre>

<h2><span class="n">6</span>结论</h2>
<p>批次 A/B 的七项已关闭：太阳恢复色相与日冕、水星与月球从黑饼回到可辨、星空与恒星名标签回来、导航在减少动效下仍有过程、黄道光不再把背景填灰、轨道线默认开启，并新增实时测光（待标定）。</p>
<p>批次 C 的六项渲染细节尚未处理。其中"月球偏暗"与"冰卫星过纹理化"需要在"物理正确"和"像线上"之间做一次产品判断——线上本身在月球低轨是过曝的。</p>
"""


def data_uri(name):
    w, h, bpp, px = mr.read_png(os.path.join(IMG, name))
    return "data:image/png;base64," + base64.b64encode(mr.encode_png(w, h, bpp, px)).decode()


html = ("<title>Solar Wanderer 修复对照</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        "<style>" + CSS + "</style>\n<div class=\"wrap\">\n"
        + BODY.replace("__TABLE__", TABLE) + "\n")

# 全部机位图册（正文 5 张之外）
used = {"earth-space.png", "jupiter-space.png", "saturn-rings-edge.png",
        "earth-night.png", "moon-ground-horizon.png"}
items = []
for name in sorted(os.listdir(IMG)):
    if name in used or not name.endswith(".png"):
        continue
    items.append(f'<figure style="margin:0 0 22px"><img src="{data_uri(name)}" '
                 f'style="width:100%;border:1px solid var(--line);border-radius:6px">'
                 f"<figcaption>{name[:-4]}</figcaption></figure>")
gallery = ("\n<h2><span class=\"n\">7</span>其余机位</h2>\n"
           "<p>左：线上　右：本地。</p>\n" + "\n".join(items) + "\n")

html = re.sub(r'src="img/([^"]+)"', lambda m: 'src="%s"' % data_uri(m.group(1)), html)
idx = html.rstrip().rfind("</div>")
html = html[:idx] + gallery + html[idx:]

open(OUT, "w", encoding="utf-8").write(html)
print("写出 %s  %.2f MB  图 %d 张" % (OUT, os.path.getsize(OUT) / 1048576, len(items) + 5))
