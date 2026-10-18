# 两个打包产物之间的"能力指纹"集合差。
# 压缩会重命名标识符，但**字符串字面量与 GLSL 源码里的 uniform/函数名原样保留**，
# 所以它们可以作为"这份构建里有没有这个能力"的可靠指纹。
import re, sys, glob

DQ = re.compile(r'"([^"]{4,200})"')
SQ = re.compile(r"'([^']{4,200})'")
UNI = re.compile(r"\b(u[A-Z][A-Za-z0-9]{2,40})\b")
SNAKE = re.compile(r"\b([a-z][A-Za-z0-9]*_[a-z][A-Za-z0-9]*)\b")
CAMEL = re.compile(r"\b([a-z]+[A-Z][A-Za-z0-9]{6,40})\b")


def tokens(path):
    s = open(path, encoding="utf-8", errors="replace").read()
    out = set()
    for rx, tag in ((DQ, "s"), (SQ, "s"), (UNI, "u"), (SNAKE, "u"), (CAMEL, "u")):
        for m in rx.finditer(s):
            out.add((tag, m.group(1)))
    return out


def main(a, b, only_a_limit=120):
    ta, tb = tokens(a), tokens(b)
    print(f"A={a}  {len(ta)} tokens")
    print(f"B={b}  {len(tb)} tokens")
    only_a = sorted(ta - tb)
    only_b = sorted(tb - ta)
    print(f"\n=== 只在 A 里有（{len(only_a)}）===")
    for k, v in only_a[:only_a_limit]:
        print(f"  {k}  {v}")
    print(f"\n=== 只在 B 里有（{len(only_b)}）===")
    for k, v in only_b[:only_a_limit]:
        print(f"  {k}  {v}")


if __name__ == "__main__":
    a = sys.argv[1]
    b = sys.argv[2] if len(sys.argv) > 2 else sorted(glob.glob("dist/assets/main-*.js"))[0]
    main(a, b)
