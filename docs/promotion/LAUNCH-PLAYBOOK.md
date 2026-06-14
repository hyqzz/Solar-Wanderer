# 🚀 Solar Wanderer v2.0.0 发布传播手册（Launch Playbook）

> 这是**唯一入口文档**。助手已把能自动做的全做了；本手册把**只能你本人操作**的事整理成按优先级、复制即执行的清单。
> 主线卖点：**v2.0.0 完整移动端支持——"手机上零下载就能登陆月球"**。
> 配套：策略 `PROMOTION_PLAN.md` · 复制即发 `POSTING_SCHEDULE.md` · 平台长文案 `hn-post.md`/`reddit-posts.md`/`chinese-posts.md` · 数字口径 `FACTS.md`。

---

## ✅ 助手已完成（无需你操作）

- [x] **GitHub Release v2.0.0** 已发布并标为 latest：https://github.com/hyqzz/Solar-Wanderer/releases/tag/v2.0.0
- [x] **仓库 description / homepage / topics** 已更新（15 个 topics，含 solar-system / threejs / webgl / nasa / education 等）
- [x] **线上站点已是 v2.0.0**（sw.icodestar.net 已部署移动端版本）
- [x] **README** 重写：移动端升为头部卖点，全部数字校准（约 200 kB gzip、0.5 m–10 万 AU、21 卫星、19 可登陆），移动端移出 roadmap
- [x] **全部推广文案重写为 v2.0.0**：HN / Reddit / Twitter / 知乎 / B站 / 抖音竖屏 / 小红书 / 掘金 / dev.to / V2EX / Three.js Forum
- [x] **移动端真机截图 ×5** 生成入库：`docs/promotion/mobile-shots/`（地球弧光、土星、木星、目录抽屉、火星+时间）
- [x] **`FACTS.md` 事实基准表**：统一所有口径，杜绝数字不一致
- [x] **Awesome 清单分支已备好**（fork + 分支 + 正确字母序条目已提交，差你点一下开 PR——见下方第 3 项）

---

## 📋 需你操作（按优先级，复制即可执行）

### ① 录一段手机竖屏录屏（本轮最重要素材，~15 分钟）

短视频是这轮最大流量点，但**必须真机实拍**（软渲染截图没质感）。

**步骤：**
1. 手机浏览器打开 `https://sw.icodestar.net`，点"进入"。
2. 开系统录屏（iPhone：控制中心●；安卓：下拉录屏）。**竖屏**录。
3. 按这个镜头顺序录约 30–40 秒：
   - 地球悬在画面 →（2s）
   - **双指捏合放大**，冲过大气，降落到月球表面 →（8s，这是核心镜头，慢一点）
   - 抬头，地球挂在黑色天空 →（4s）
   - 点右下 ☰ 打开目录 → 点"土星"飞过去，看环 →（6s）
   - 点"木星"飞进云层 →（4s）
   - 回地球，捏合到海面继续推进，潜入水下 →（5s）
   - 点右上时间标签展开，加速看运动 →（4s）
4. 停止录屏，存好。这段录屏供**抖音/视频号/B站竖屏 + Twitter 主推 + 小红书封面**共用。

> 配文/脚本已写好：`chinese-posts.md`「抖音 / 视频号 / B站竖屏」。

---

### ② 按时间表发帖（核心传播，分散在一周内）

**完整复制即发清单：`POSTING_SCHEDULE.md`**（每条都带标题、正文、UTM 链接、发布时间）。

最小执行版（按 ROI 只发这 6 个也够）：

| 顺序 | 平台 | 文案位置 |
|---|---|---|
| 1 | 抖音/视频号/B站竖屏（配①的录屏） | `chinese-posts.md`「抖音」 |
| 2 | Hacker News Show HN | `hn-post.md`（含标题+正文+首评） |
| 3 | 小红书 | `chinese-posts.md`「小红书」 |
| 4 | Reddit r/InternetIsBeautiful + r/space | `reddit-posts.md` |
| 5 | 知乎文章 + 3 个回答 | `chinese-posts.md`「知乎」 |
| 6 | Twitter/X 推文串（配①录屏） | `chinese-posts.md`「Twitter/X」 |

**发帖纪律：** ① 不同平台分散在不同时段，别同一小时齐发；② 发完蹲守评论区 2–3 小时逐条回复（HN 尤其看早期互动）；③ HN 标题别堆 emoji、别自己求赞。

---

### ③ 提交 Awesome 清单 PR（长期外链，2 次点击，~3 分钟）

助手已在你的 fork 里建好分支并提交了正确格式/字母序的条目。**因 fine-grained PAT 无法对第三方仓库开 PR，需你点链接确认：**

| 清单 | 一键开 PR（页面已预填，点 **Create pull request** 即可） |
|------|--------|
| `orbitalindex/awesome-space`（2.2k⭐） | https://github.com/orbitalindex/awesome-space/compare/master...hyqzz:awesome-space:add-solar-wanderer?expand=1 |
| `terkelg/awesome-creative-coding`（14.9k⭐） | https://github.com/terkelg/awesome-creative-coding/compare/main...hyqzz:awesome-creative-coding:add-solar-wanderer?expand=1 |

> 礼仪：一个清单只提一次；被拒就坦然接受别催。
> 想让助手全自动开 PR？给一个 **classic PAT（勾 `public_repo`）** 即可，届时无需手动点。

---

### ④ 设置 GitHub 仓库社交预览图（决定每个分享链接的卡片样式，~1 分钟）

GitHub 无此 API，必须手动：
1. 打开 https://github.com/hyqzz/Solar-Wanderer/settings
2. 下滑到 **Social preview** → **Edit → Upload an image**
3. 选仓库里的 `docs/promotion/social-card.png`

---

### ⑤ Product Hunt（可选，能放大开发者圈曝光，~20 分钟）

1. 提前一天在 https://www.producthunt.com/posts/new 建草稿（周二–周四 00:01 PT 上线最佳）。
2. Tagline：`Explore the entire solar system 1:1, in your browser — now on mobile`
3. 首图用 `social-card.png`；画廊放①的手机录屏 + 3 张 `mobile-shots/` 截图。
4. First comment 用 `hn-post.md` 正文精简版。
5. 上线**当天**（非前夜）请朋友去 upvote。

---

### ⑥ 教育 / 科普 Outreach（长尾影响力，~30 分钟）

邮件模板 + 收件人方向见 `PROMOTION_PLAN.md`「教育 / 科普 outreach」。本轮强调"学生手机即可访问，无需机房安装"。给 10–20 位科普/教育博主或机构各发一封。

---

## 🖼 素材清单（发帖时按需取用）

| 素材 | 路径 / 链接 | 用途 |
|------|------------|------|
| 在线体验 | https://sw.icodestar.net | 所有帖子主链接 |
| GitHub 仓库 | https://github.com/hyqzz/Solar-Wanderer | Star / 源码 |
| v2.0.0 Release | https://github.com/hyqzz/Solar-Wanderer/releases/tag/v2.0.0 | 版本说明 |
| 桌面演示 GIF | `docs/promotion/demo.gif` | README、Reddit、知乎、掘金 |
| 桌面演示 MP4 | `docs/promotion/demo.mp4` | Twitter、PH 画廊 |
| 社交卡片 1280×640 | `docs/promotion/social-card.png` | GitHub 社交预览、PH 缩略图 |
| **移动端真机截图 ×5** | `docs/promotion/mobile-shots/` | 小红书/PH 画廊/知乎配图 |
| 静态截图 ×9 | `docs/sdlc/screenshots/example/` | 备用配图 |
| **手机竖屏录屏** | ⏳ 你录（第①项） | 抖音/视频号/B站/Twitter/小红书 |

---

## 📝 一句话电梯陈述（随处可用）

> **中文**：用浏览器——现在手机也行——打开一个 1:1 的真实太阳系。行星位置来自 NASA JPL，是此刻真实的位置。双指一捏就能从地球轨道无缝降落月球表面，抬头地球挂在黑色天空里。免安装、免账号、开源。

> **EN**: A 1:1 real-time solar system in your browser — now on your phone. Planet positions come from NASA JPL; they're where they actually are right now. Pinch from Earth orbit straight down to standing on the Moon, no loading. Zero install, open source.
