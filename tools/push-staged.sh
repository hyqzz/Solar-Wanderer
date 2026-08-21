#!/bin/sh
# 分段推送：把 public/dem/ 按 (天体, 层级/象限) 切成小块，经 stage 分支逐块上传，
# 最后推 main（DEM 对象已在远端，剩余包很小）。用于大文件包在弱网/代理下被重置的场景。
# 用法：GH_TOKEN=xxx sh /tmp/push-staged.sh   （从仓外副本运行，防止脚本自删）
set -e
[ -z "$GH_TOKEN" ] && { echo "需要 GH_TOKEN 环境变量"; exit 1; }
cd /c/Users/hyqzz/Projects/solorsystem
URL="https://x-access-token:${GH_TOKEN}@github.com/hyqzz/Solar-Wanderer.git"
BASE=0ccee35895ba98c48bd0ebc7809d7d760e0fa6ce  # 远端当前 HEAD（DEM 之前）
N=0
push_path() {
  N=$((N + 1))
  git checkout -q -f -b "stage-$N" "$BASE"
  git checkout -q -f main -- "$1"
  git add -A -- "$1"
  git commit -q -m "chore(dem): stage $1"
  ok=0
  for attempt in 1 2 3 4; do
    if git push -q "$URL" "stage-$N:refs/heads/stage-dem-$N" 2>/dev/null; then ok=1; break; fi
    echo "RETRY($attempt) [$N] $1"; sleep 8
  done
  git checkout -q -f main
  git branch -q -D "stage-$N"
  [ $ok -eq 1 ] && echo "OK  [$N] $1" || echo "FAIL [$N] $1"
}

for body in moon mars earth; do
  push_path "public/dem/$body/index.json"
  for z in 0 1 2 3; do push_path "public/dem/$body/$z"; done
  for q in 0 1 2 3; do
    lo=$((q * 4))
    N=$((N + 1))
    git checkout -q -f -b "stage-$N" "$BASE"
    for x in $(seq $lo $((lo + 3))); do git checkout -q -f main -- "public/dem/$body/4/$x"; done
    git add -A
    git commit -q -m "chore(dem): stage $body L4 q$q"
    ok=0
    for attempt in 1 2 3 4; do
      if git push -q "$URL" "stage-$N:refs/heads/stage-dem-$N" 2>/dev/null; then ok=1; break; fi
      echo "RETRY($attempt) [$N] $body L4 q$q"; sleep 8
    done
    git checkout -q -f main
    git branch -q -D "stage-$N"
    [ $ok -eq 1 ] && echo "OK  [$N] $body L4 q$q" || echo "FAIL [$N] $body L4 q$q"
  done
done

echo "=== DEM 块完成，推 main ==="
ok=0
for attempt in 1 2 3 4 5; do
  if git push "$URL" main:main 2>&1 | tail -2; then
    if git ls-remote "$URL" main 2>/dev/null | grep -q "$(git rev-parse main)"; then ok=1; break; fi
  fi
  echo "RETRY($attempt) main"; sleep 12
done
# 清理远端 stage 分支
for b in $(git ls-remote "$URL" 'refs/heads/stage-dem-*' 2>/dev/null | awk '{print $2}' | sed 's|refs/heads/||'); do
  git push -q "$URL" --delete "$b" 2>/dev/null || true
done
[ $ok -eq 1 ] && echo MAIN-PUSHED || echo MAIN-FAILED
