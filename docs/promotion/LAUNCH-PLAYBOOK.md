# 🚀 Solar Wanderer 发布传播手册（Launch Playbook）

> 目标：最大化曝光、传播、使用与影响力。
> 本手册把"必须真人操作"的发帖工作整理成**按最优时序、复制即发**的清单。
> 自动化部分（GitHub Release、Discussions、贡献 issue、SEO、演示 GIF、社交卡片）**已由助手完成**，见文末「已完成」清单。

---

## 📦 资产清单（发帖时按需附带）

| 资产 | 路径 / 链接 | 用途 |
|------|------------|------|
| 在线体验 | https://sw.icodestar.net | 所有帖子主链接 |
| GitHub 仓库 | https://github.com/hyqzz/Solar-Wanderer | Star / 源码 |
| 演示 GIF（5.8 MB） | `docs/promotion/demo.gif` | README、Reddit、知乎、掘金 |
| 演示视频 MP4（2.1 MB） | `docs/promotion/demo.mp4` | Twitter/X、B站封面、Product Hunt |
| 社交卡片（1280×640） | `docs/promotion/social-card.png` | GitHub 社交预览、PH 缩略图 |
| 静态截图 ×9 | `docs/sdlc/screenshots/example/` | 备用配图 |

> **更长/更精致的视频**：用录屏软件（OBS / Win+G）实拍 30–60s——真实 GPU 画质远胜 headless GIF。
> 推荐镜头：① 滚轮从地球轨道无缝降落月球→抬头看地球 ② 飞进木星云层 ③ 土星环近景 ④ 时间加速看行星公转。

---

## ⏰ 发布时序（建议一周内，分散而非同日全发）

> 时区均按**美东（ET）**——英文社区主力在此。换算：ET + 12h = 北京时间次日。

### Day 0（周二或周三，最佳）
1. **08:00 ET｜Hacker News — Show HN**
   - 标题/正文见 `hn-post.md`
   - ⚠️ HN 规则：标题不要堆叠 emoji；自己别先点赞/求赞；发完在评论区补一条技术细节钩子。
   - 发布后**蹲守评论 2–3 小时**逐条认真回复（HN 排名看早期互动质量）。

2. **09:30 ET｜r/InternetIsBeautiful**（见 `reddit-posts.md`）
   - 附 GIF 或视频。这个 sub 对"浏览器里能跑"的视觉项目极友好。

### Day 1
3. **10:00 ET｜r/space** + **r/threejs**（错峰，见 `reddit-posts.md`）
   - r/space 强调 NASA JPL 真实位置；r/threejs 强调浮动原点/对数深度/大气着色器。
4. **晚上（北京时间黄金档）｜V2EX 分享创造**（见 `chinese-posts.md`）

### Day 2
5. **Product Hunt**（周二–周四 00:01 PT 上线，提前一天建好草稿）
   - Tagline: *"Explore the entire solar system 1:1, in your browser"*
   - 首图用 `social-card.png`，画廊放 `demo.mp4` + 3 张截图。
   - First comment 用 `hn-post.md` 正文精简版。
   - 发动朋友在**上线当天**而非前夜投票。

### Day 3–5（持续放）
6. **掘金**技术长文（见 `chinese-posts.md`，含代码，SEO 长尾流量）
7. **知乎**回答相关问题（见 `chinese-posts.md` 的目标问题）
8. **B站**视频（脚本见 `chinese-posts.md`），简介放 GitHub + 在线链接
9. **Twitter/X** 推文串（见 `chinese-posts.md`），主推附 `demo.mp4`
10. **r/webgl / r/gamedev**（技术向，见 `reddit-posts.md`）

### 持续
- **awesome 清单 PR**（见下节）——长期外链与发现入口
- 回复所有评论/issue；每涨一批 star 截图发 Twitter 维持势头

---

## 🔗 Awesome 清单提交（长期发现渠道）

向以下清单提交 PR（按相关度排序）。**助手可代为自动开 PR**，或你手动 fork 提交：

| 清单 | 仓库 | 建议归类 |
|------|------|----------|
| awesome-threejs | `mrdoob/three.js` wiki / `made1ev1n/awesome-threejs` | Showcase / Examples |
| awesome-webgl | `sjfricke/awesome-webgl` | Demos / Projects |
| awesome-creative-coding | `terkelg/awesome-creative-coding` | Visualization |
| awesome-space | `mbiarnes/awesome-space`（如存在） | Tools / Simulators |

**统一条目文案：**
```markdown
- [Solar Wanderer](https://sw.icodestar.net) — 1:1 real-time solar system explorer in the browser; NASA JPL ephemerides, seamless planet landing, ray-marched atmospheres. [[source](https://github.com/hyqzz/Solar-Wanderer)]
```
> ⚠️ 礼仪：一个清单只提一次；遵守该清单的格式与字母序；PR 描述里说明项目是什么、为何契合。0 star 阶段部分清单可能要求成熟度，被拒就换下一个，别催。

---

## 🖼 你的两步手动操作（助手无 API 权限）

**设置 GitHub 仓库社交预览图**（决定每个分享链接的卡片样式）：
1. 打开 https://github.com/hyqzz/Solar-Wanderer/settings → 往下找 **Social preview**
2. 点 **Edit → Upload an image**，选择仓库里的 `docs/promotion/social-card.png`

---

## ✅ 助手已自动完成（GitHub 侧 + 站点侧）

- [x] **Release v1.1.0** 发布并标为 latest（全站 feed 曝光）
- [x] **GitHub Discussions** 已开启（社区问答中心）
- [x] **6 个贡献 issue**（good first issue / help wanted，邀请协作者）
- [x] **演示 GIF** 嵌入 README 顶部 hero 位（5.8 MB，纯天体画面）
- [x] **演示 MP4** + **社交卡片** 生成入库
- [x] **SEO**：`robots.txt` + `sitemap.xml` + JSON-LD 结构化数据，已部署并验证线上可访问
- [x] 仓库 topics / description / homepage 完整（之前已配）

---

## 📝 一句话电梯陈述（随处可用）

> **中文**：用浏览器打开一个 1:1 的真实太阳系——行星位置来自 NASA JPL 星历，是此刻真实的位置。滚轮一路推进就能从地球轨道无缝降落月球表面，抬头地球挂在黑色天空里。纯网页，无需安装。

> **EN**: A 1:1 real-time solar system in your browser. Planet positions come from NASA JPL — they're where they actually are right now. Scroll from Earth orbit straight down to walking on the Moon, no loading. Zero install.
