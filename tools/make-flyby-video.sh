#!/usr/bin/env bash
# 把 LOD 掠飞的两侧帧序列合成对比视频：
#   上排 = 线上 | 本地 并排；下排 = 逐帧竖直位移残差曲线（示波器），白色游标随时间推进。
# 用法：bash tools/make-flyby-video.sh <线上帧目录> <本地帧目录> <曲线PNG> <输出mp4>
set -e
FF="${FFMPEG:-C:/Users/hyqzz/Programs/ffmpeg/ffmpeg.exe}"
LIVE="$1"; LOCAL="$2"; CHART="$3"; OUT="$4"
FPS=25
FONT='C\:/Windows/Fonts/msyh.ttc'
N=$(ls "$LOCAL" | grep -c '\.png$')

python -I - <<'PY'
from PIL import Image
# 曲线底是深色，游标用亮黄，正好压住曲线又不遮数据
Image.new("RGBA", (3, 250), (255, 209, 102, 235)).save(".cmp/_cursor.png")
PY

"$FF" -y -hide_banner -loglevel error \
  -framerate $FPS -i "$LIVE/f%04d.png" \
  -framerate $FPS -i "$LOCAL/f%04d.png" \
  -loop 1 -framerate $FPS -i "$CHART" \
  -loop 1 -framerate $FPS -i .cmp/_cursor.png \
  -filter_complex "\
[0:v]drawtext=fontfile='$FONT':text='线上  sw.icodestar.net':x=18:y=16:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10[lv];\
[1:v]drawtext=fontfile='$FONT':text='本地  main':x=18:y=16:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10[lo];\
[lv][lo]hstack=inputs=2[top];\
[2:v]format=rgba[ch];\
[3:v]format=rgba[cu];\
[ch][cu]overlay=x='(n/$((N-1)))*1437':y=0[chart];\
[top][chart]vstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -r $FPS -frames:v $N \
  -c:v libx264 -preset slow -crf 19 -movflags +faststart "$OUT"
echo "写出 $OUT  $(du -h "$OUT" | cut -f1)"
