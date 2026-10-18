# 把对比报告打包成**单个自包含 HTML**：所有图片内联为 data URI，脱离文件夹也能看。
# 用法：python tools/make-report.py
import base64
import os
import re
import struct
import sys
import zlib

SRC = ".cmp/report/index.html"
IMG = ".cmp/report/img"
OUT = ".cmp/Solar-Wanderer-版本对比.html"

# 全部 30 个机位，用于文末完整图册（按场景表顺序）
GALLERY = [
    ("earth-space", "地球 深空（3.2R）"),
    ("earth-space-late", "地球 深空（长等待 22s）"),
    ("earth-leo", "地球 低轨 400km"),
    ("earth-night", "地球 夜面"),
    ("earth-ground-horizon", "地球 地面 平视"),
    ("earth-ground-up", "地球 地面 仰视"),
    ("earth-underwater", "地球 水下"),
    ("mars-space", "火星 深空"),
    ("mars-ground-horizon", "火星 地面 平视"),
    ("mars-ground-up", "火星 地面 仰视"),
    ("titan-ground-horizon", "土卫六 地面 平视"),
    ("titan-ground-up", "土卫六 地面 仰视"),
    ("moon-ground-horizon", "月球 地面 平视"),
    ("moon-ground-up", "月球 地面 仰视"),
    ("moon-ground-dusk", "月球 地面 暮光"),
    ("mars-ground-dusk", "火星 地面 暮光"),
    ("mercury-ground-horizon", "水星 地面 平视"),
    ("moon-loworbit", "月球 低轨 300km"),
    ("mars-loworbit", "火星 低轨 300km"),
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


def read_png(path):
    d = open(path, "rb").read()
    i, w, h, ct, idat = 8, None, None, 6, b""
    while i < len(d):
        ln = struct.unpack(">I", d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        data = d[i + 8:i + 8 + ln]
        if typ == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", data[:10])
        elif typ == b"IDAT":
            idat += data
        i += 12 + ln
    raw = zlib.decompress(idat)
    bpp = 4 if ct == 6 else 3
    stride = w * bpp
    out = bytearray()
    prev = bytearray(stride)
    pos = 0
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    return w, h, bpp, bytes(out)


def encode_png(w, h, bpp, px):
    """逐行自适应滤波（0–4 里挑绝对值和最小的），再 zlib 最高压缩。
    报告里 30 张照片拼图，固定 filter=0 会大出一截；这一步行之有效且无依赖。"""
    stride = w * bpp
    prev = bytearray(stride)
    raw = bytearray()
    cands = [bytearray(stride) for _ in range(5)]
    for y in range(h):
        line = px[y * stride:(y + 1) * stride]
        best_f, best_score, best = 0, None, None
        for f in range(5):
            c = cands[f]
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                cc = prev[x - bpp] if x >= bpp else 0
                if f == 0:
                    v = line[x]
                elif f == 1:
                    v = line[x] - a
                elif f == 2:
                    v = line[x] - b
                elif f == 3:
                    v = line[x] - ((a + b) >> 1)
                else:
                    p = a + b - cc
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - cc)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else cc)
                    v = line[x] - pr
                c[x] = v & 255
            score = sum(v if v < 128 else 256 - v for v in c)
            if best_score is None or score < best_score:
                best_score, best_f, best = score, f, bytes(c)
        raw.append(best_f)
        raw += best
        prev = bytearray(line)
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    return (bytes([137, 80, 78, 71, 13, 10, 26, 10])
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2 if bpp == 3 else 6, 0, 0, 0))
            + chunk(b"IDAT", comp) + chunk(b"IEND", b""))


def data_uri(path):
    w, h, bpp, px = read_png(path)
    return "data:image/png;base64," + base64.b64encode(encode_png(w, h, bpp, px)).decode("ascii")


def main():
    html = open(SRC, encoding="utf-8").read()

    # 1) 正文里的 10 张图内联（同名复用的写一次，后续用同一个 URI 字符串）
    cache = {}

    def repl(m):
        name = m.group(1)
        if name not in cache:
            p = os.path.join(IMG, name)
            cache[name] = data_uri(p)
        return 'src="%s"' % cache[name]

    html = re.sub(r'src="img/([^"]+)"', repl, html)

    # 2) 文末追加完整图册
    items = []
    for name, label in GALLERY:
        p = os.path.join(IMG, name + ".png")
        if not os.path.exists(p):
            print("跳过缺失图片:", name, file=sys.stderr)
            continue
        if name + ".png" in cache:
            continue                      # 正文里已经出现过，不重复内嵌（同一张图存两份纯浪费体积）
        uri = data_uri(p)
        items.append(
            '<figure style="margin:0 0 26px">'
            '<img src="%s" alt="%s" style="display:block;width:100%%;border:1px solid var(--line);border-radius:6px">'
            '<figcaption style="font-size:12.5px;color:var(--muted);margin-top:8px;font-family:var(--mono)">'
            '%s　<span style="opacity:.7">%s</span></figcaption></figure>'
            % (uri, label, name, label)
        )
    gallery = (
        '\n<h2><span class="n">4</span>完整图册（30 个机位）</h2>\n'
        '<p>每一张都是并排对比：<b>左 = 线上</b>，<b>右 = 本地</b>。按场景表的顺序排列。</p>\n'
        + "\n".join(items)
        + "\n"
    )
    # 插到 .wrap 结束标签之前
    idx = html.rstrip().rfind("</div>")
    html = html[:idx] + gallery + html[idx:]

    # 3) 顶部补一句"自包含"说明
    html = html.replace(
        "两边的场景脚本、画质档（medium）、分辨率与相机参数完全相同。",
        "两边的场景脚本、画质档（medium）、分辨率与相机参数完全相同。"
        "本文件已内联全部截图，可离线单独打开。",
        1,
    )

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    size = os.path.getsize(OUT)
    print("写出 %s  %.2f MB  图片 %d 张（内联 %d 张）" % (OUT, size / 1048576, len(GALLERY), len(cache)))


if __name__ == "__main__":
    main()
