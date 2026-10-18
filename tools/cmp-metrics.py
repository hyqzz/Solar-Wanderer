# 两个目录下的同机位截图：逐张算指标 + 生成并排拼图。
# 指标在离线算（而不是页面内 readPixels），因为旧版本站点的 window.__game
# 不导出 renderer/composer，页面内取不到。
#
# 用法：python tools/cmp-metrics.py .cmp/live .cmp/local [输出目录]
import sys, os, zlib, struct, glob

# ---------- PNG 读写（纯标准库） ----------
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


def write_png(path, w, h, rgb):
    raw = bytearray()
    stride = w * 3
    for y in range(h):
        raw.append(0)
        raw += rgb[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 6)

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    out += chunk(b"IDAT", comp)
    out += chunk(b"IEND", b"")
    open(path, "wb").write(out)


# ---------- 指标 ----------
def stats(w, h, bpp, px):
    n = w * h
    lum = [0] * n
    s = 0
    for i in range(n):
        o = i * bpp
        v = (px[o] * 299 + px[o + 1] * 587 + px[o + 2] * 114) // 1000
        lum[i] = v
        s += v
    mean = s / n
    var = sum((v - mean) ** 2 for v in lum) / n
    # 纹理能量：相邻像素差的平均绝对值（越高越"有细节"）
    tex = 0
    cnt = 0
    for y in range(0, h, 2):
        row = y * w
        for x in range(1, w, 2):
            tex += abs(lum[row + x] - lum[row + x - 1])
            cnt += 1
    tex /= max(cnt, 1)
    dark = sum(1 for v in lum if v < 12) / n
    blown = sum(1 for v in lum if v > 250) / n
    return {"mean": mean, "std": var ** 0.5, "tex": tex, "dark": dark * 100, "blown": blown * 100}


def diff(a, b):
    (w1, h1, b1, p1), (w2, h2, b2, p2) = a, b
    if (w1, h1) != (w2, h2):
        return None
    n = w1 * h1
    tot = 0
    big = 0
    for i in range(n):
        o1, o2 = i * b1, i * b2
        d = (abs(p1[o1] - p2[o2]) + abs(p1[o1 + 1] - p2[o2 + 1]) + abs(p1[o1 + 2] - p2[o2 + 2])) / 3
        tot += d
        if d > 40:
            big += 1
    return tot / n, big / n * 100


def side_by_side(pa, pb, out, label_a, label_b):
    wa, ha, ba, pa_px = read_png(pa)
    wb, hb, bb, pb_px = read_png(pb)
    if (wa, ha) != (wb, hb):
        return False
    h = ha
    W = wa * 2 + 6
    buf = bytearray(b"\x20" * (W * h * 3))
    for y in range(h):
        for x in range(wa):
            o = (y * wa + x) * ba
            d = (y * W + x) * 3
            buf[d:d + 3] = pa_px[o:o + 3]
            o2 = (y * wb + x) * bb
            d2 = (y * W + wa + 6 + x) * 3
            buf[d2:d2 + 3] = pb_px[o2:o2 + 3]
    write_png(out, W, h, bytes(buf))
    return True


def main():
    dir_a, dir_b = sys.argv[1], sys.argv[2]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else None
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    names = sorted(os.path.basename(p) for p in glob.glob(os.path.join(dir_a, "*.png")))
    print(f"{'场景':<24}{'线上均值':>8}{'本地均值':>8}{'Δ':>7}   {'线上纹理':>8}{'本地纹理':>8}   {'线上暗%':>7}{'本地暗%':>7}   {'像素差':>7}{'差异面积%':>9}")
    rows = []
    for nm in names:
        pa, pb = os.path.join(dir_a, nm), os.path.join(dir_b, nm)
        if not os.path.exists(pb):
            print(f"{nm[:-4]:<24}  (本地缺)")
            continue
        ia, ib = read_png(pa), read_png(pb)
        sa, sb = stats(*ia), stats(*ib)
        d = diff(ia, ib)
        ds = f"{d[0]:7.1f}{d[1]:9.1f}" if d else "  尺寸不同"
        print(f"{nm[:-4]:<24}{sa['mean']:8.1f}{sb['mean']:8.1f}{sb['mean']-sa['mean']:+7.1f}   "
              f"{sa['tex']:8.2f}{sb['tex']:8.2f}   {sa['dark']:7.1f}{sb['dark']:7.1f}   {ds}")
        rows.append((nm, sa, sb, d))
        if out_dir:
            side_by_side(pa, pb, os.path.join(out_dir, nm), "live", "local")
    print(f"\n共 {len(rows)} 个同机位。并排图（左=线上，右=本地）写入 {out_dir or '(未生成)'}")


if __name__ == "__main__":
    main()
