# Campaign 资产总索引

> 本目录所有文件均已在 `.gitignore` 中排除，不会进入 Git 版本控制。
> 生成日期：2026-06-19

---

## 一、可直接发布的文案

| 文件 | 用途 | 平台 |
|---|---|---|
| `publish-ready/day-01-overseas.md` | 海外首日完整发布包 | Product Hunt、HN、Reddit、LinkedIn、Twitter/X |
| `publish-ready/day-02-chinese.md` | 中文次日完整发布包 | V2EX、知乎、B站、小红书、即刻/微博 |
| `publish-ready/day-03-blogs.md` | 技术博客与 Newsletter | Dev.to、Medium、掘金、CSDN、Substack/小报童 |
| `publish-ready/short-video-kit.md` | 短视频标题/文案/标签/封面 | 抖音、小红书、B站竖版、YouTube Shorts、TikTok、Reels |
| `day-01-producthunt-hn/*.md` | 海外首日原始脚本 | 备用/拆分 |
| `day-02-chinese-dev/*.md` | 中文次日原始脚本 | 备用/拆分 |
| `day-03-tech-blogs/*.md` | 博客原始脚本 | 备用 |
| `day-04-short-videos-scale/README.md` | 第 4 天短视频计划 | 参考 |
| `day-05-short-videos-emotion/README.md` | 第 5 天短视频计划 | 参考 |
| `day-06` ~ `day-14` | 后续运营脚本 | 社群、KOL、教育、SEO、UGC、分析、复盘 |

---

## 二、视频素材

所有视频位于 `campaign/assets/videos/`。

| 文件名 | 时长 | 分辨率 | 语言 | 建议用途 |
|---|---|---|---|---|
| `main-demo-zh.mp4` | 48s | 1080×1920 | 中文 | B站主投稿、视频号、抖音、小红书、知乎视频 |
| `main-demo-en.mp4` | 48s | 1080×1920 | 英文 | YouTube、Twitter/X、LinkedIn、Product Hunt |
| `short-earth-to-oort-zh.mp4` | 15s | 1080×1920 | 中文 | 竖屏短视频：比例震撼 |
| `short-earth-to-oort-en.mp4` | 15s | 1080×1920 | 英文 | YouTube Shorts / TikTok / Reels |
| `short-saturn-rings-zh.mp4` | 12s | 1080×1920 | 中文 | 竖屏短视频：土星环 |
| `short-saturn-rings-en.mp4` | 12s | 1080×1920 | 英文 | YouTube Shorts / TikTok / Reels |
| `short-jupiter-storm-zh.mp4` | 12s | 1080×1920 | 中文 | 竖屏短视频：木星大红斑 |
| `short-jupiter-storm-en.mp4` | 12s | 1080×1920 | 英文 | YouTube Shorts / TikTok / Reels |
| `short-moon-earthrise-zh.mp4` | 12s | 1080×1920 | 中文 | 竖屏短视频：月球地球升起 |
| `short-moon-earthrise-en.mp4` | 12s | 1080×1920 | 英文 | YouTube Shorts / TikTok / Reels |
| `short-mars-sunset-zh.mp4` | 12s | 1080×1920 | 中文 | 竖屏短视频：火星蓝色日落 |
| `short-mars-sunset-en.mp4` | 12s | 1080×1920 | 英文 | YouTube Shorts / TikTok / Reels |
| `earth-to-oort.mp4` | 10s | 1080×1920 | 无字幕 | 备用 raw 序列合成视频 |

### 视频封面（推荐使用 social-cards）
- 主 demo：`social-cards/intro_zh_1080x1920.png` / `intro_en_1080x1920.png`
- 各短视频：对应 `social-cards/{id}_zh_1080x1920.png` / `{id}_en_1080x1920.png`

---

## 三、图片素材

### 3.1 场景截图 `campaign/assets/screenshots/`

| 文件名（1920×1080） | 文件名（1080×1920） | 场景 |
|---|---|---|
| `earth-orbit_1920x1080.png` | `earth-orbit_1080x1920.png` | 地球轨道 |
| `moon-earthrise_1920x1080.png` | `moon-earthrise_1080x1920.png` | 月球看地球 |
| `mars-sunset_1920x1080.png` | `mars-sunset_1080x1920.png` | 火星蓝色日落 |
| `saturn-rings_1920x1080.png` | `saturn-rings_1080x1920.png` | 土星环 |
| `jupiter-redspot_1920x1080.png` | `jupiter-redspot_1080x1920.png` | 木星大红斑 |
| `sun-closeup_1920x1080.png` | `sun-closeup_1080x1920.png` | 太阳近景 |
| `pluto-heart_1920x1080.png` | `pluto-heart_1080x1920.png` | 冥王星心形平原 |

### 3.2 社交卡片 `campaign/assets/social-cards/`

每种主题生成 4 张：
- `{id}_zh_1080x1350.png` — 中文，3:4（小红书/Instagram/知乎）
- `{id}_zh_1080x1920.png` — 中文，9:16（Stories/抖音/视频号）
- `{id}_en_1080x1350.png` — 英文，3:4
- `{id}_en_1080x1920.png` — 英文，9:16

主题 id：`intro`、`moon`、`mars`、`saturn`、`jupiter`、`sun`、`scale`、`free`

### 3.3 平台配图速查

| 平台 | 推荐尺寸 | 推荐文件 |
|---|---|---|
| Product Hunt gallery | 16:9 | `screenshots/*_1920x1080.png` |
| Twitter/X 单图 | 16:9 或 3:4 | `screenshots/*_1920x1080.png` / `social-cards/*_1080x1350.png` |
| LinkedIn | 3:4 | `social-cards/*_1080x1350.png` |
| 小红书笔记 | 3:4 或 9:16 | `social-cards/*_1080x1350.png` |
| 小红书/抖音视频封面 | 9:16 | `social-cards/*_1080x1920.png` |
| B站视频封面 | 16:9 | `screenshots/*_1920x1080.png` |
| 知乎文章首图 | 16:9 或 3:4 | `social-cards/intro_zh_1080x1350.png` |
| 即刻/微博 | 3:4 | `social-cards/*_1080x1350.png` |

---

## 四、原始帧序列

`campaign/assets/video-sequences/` 下保存了部分场景的逐帧 PNG：
- `earth-to-oort/` — 150 帧，从地球缩放到奥尔特云
- `moon-earthrise/` — 60 帧
- `mars-sunset/` — 60 帧

如需重新剪辑、调速或生成更高码率视频，可直接用这些帧序列。

---

## 五、字体文件

`campaign/assets/fonts/`
- `msyh.ttc` — 微软雅黑，用于中文 drawtext
- `arial.ttf` — Arial，用于英文 drawtext

---

## 六、发布流程速查

### Day 1（海外）
1. Product Hunt：上传 `main-demo-en.mp4` + 6 张 16:9 截图，粘贴文案。
2. HN：发布 `Show HN` 帖。
3. Reddit：r/webdev 和 r/space 各一帖（间隔 2 小时）。
4. LinkedIn + Twitter/X Thread。

### Day 2（中文）
1. V2EX：发布创造帖，首图用 `intro_zh_1080x1350.png`。
2. 知乎：发 1 篇专栏 + 在相关问题下回答。
3. B站：上传 `main-demo-zh.mp4`，封面用 `intro_zh_1080x1350.png`。
4. 小红书：发 9 图笔记，首图 `intro_zh_1080x1350.png`。
5. 即刻 + 微博。

### Day 3（博客/Newsletter）
1. Dev.to / Medium / Hacker Noon 发英文博客。
2. 掘金 / CSDN / 知乎专栏发中文博客。
3. Newsletter 推送。
4. Twitter/X 发技术 Thread。

### Day 4–5（短视频）
1. 按 `short-video-kit.md` 的发布节奏上传 5 个竖屏短视频。
2. 每个视频配对应 9:16 封面。
3. 评论区置顶 demo 链接。

### Day 6–14
1. Reddit r/webdev 二次发帖（带上博客链接）。
2. 教育机构/天文馆邮件外联。
3. KOL 邮件外联。
4. Discord/微信群搭建与运营。
5. SEO 落地页与关键词。
6. UGC 截图挑战。
7. 数据分析与复盘。

---

## 七、再生命令

如需重新生成全部资产：

```bash
# 1. 启动开发服务器
npm run dev

# 2. 生成截图与视频帧序列
node tools/capture-campaign-assets.mjs

# 3. 生成社交卡片
node tools/generate-social-cards.mjs

# 4. 生成主 demo 视频与短视频
node tools/generate-demo-videos.mjs
node tools/generate-short-videos.mjs
```

---

## 八、注意事项

- `campaign/` 目录已被 `.gitignore` 排除，不会提交到 Git。
- 大体积文件（视频、字体、帧序列）请勿手动拖入仓库。
- 如需分享给协作者，直接打包 `campaign/` 目录或使用网盘/云存储。
- 所有视频已烧录字幕，但 B站/YouTube 仍可上传独立 SRT（如需要可另行生成）。
