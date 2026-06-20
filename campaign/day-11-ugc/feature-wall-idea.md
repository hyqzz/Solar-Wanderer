# 用户作品墙方案

## 目标

在官网展示用户截图和故事，增强社区归属感，吸引新用户。

## 位置

在 `index.html` 底部增加一个 `Community` / `社区` 区块，链接到独立作品墙页面。

## 页面结构

```
/community/
  index.html       # 作品墙主页面
  gallery.json     # 用户作品数据
  assets/          # 用户截图缩略图
```

## 数据字段

```json
{
  "works": [
    {
      "id": "001",
      "author": "小明",
      "handle": "@xiaoming",
      "platform": "weibo",
      "location": "月球表面看地球升起",
      "image": "community/001-thumb.jpg",
      "fullImage": "community/001-full.jpg",
      "story": "第一次站在月球上看地球，才发现地球真的很孤独。",
      "date": "2026-06-20"
    }
  ]
}
```

## 设计建议

- 瀑布流布局（Masonry）。
- 每张卡片：图片 + 地点 + 作者 + 一句话故事。
- 点击放大查看原图。
- 顶部有“如何参与”说明和提交入口。
- 中英文双语。

## 实现方式

- 纯静态 JSON + JavaScript 渲染。
- 每次有新作品时，更新 `gallery.json` 并重新部署。
- 未来可迁移到 headless CMS 或 GitHub Issues 自动抓取。

## 自动化想法

- 用户发推带 #SolarWanderer，用 IFTTT/Zapier 收集到表格。
- 每周人工精选，批量更新 JSON。
- 在 README 中添加“用户作品”徽章链接。

## CTA

> 你的照片也可能出现在这里。
> 带话题 #SolarWanderer 分享你的截图，或发到 Discord #showcase。
