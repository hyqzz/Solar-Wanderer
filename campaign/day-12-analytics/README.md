# Day 12: 数据分析 / Analytics

## 今日目标

部署网站分析，建立数据看板，用数据驱动后续优化和推广。

## 文件清单

- `analytics-setup.md` — 分析工具设置指南
- `dashboard-kpis.md` — 核心指标看板
- `event-tracking-plan.md` — 事件追踪计划
- `weekly-review-template.md` — 周复盘模板

---

## 今日 KPI

- 部署至少一个分析工具（Google Analytics 4 或 Plausible）
- 追踪 5 个核心事件
- 建立周复盘机制
- 根据数据调整至少 1 个推广动作

---

## 推荐工具

| 工具 | 优点 | 缺点 | 建议 |
|------|------|------|------|
| Google Analytics 4 | 免费、功能全 | 隐私顾虑、复杂 | 主分析工具 |
| Plausible | 隐私友好、轻量 | 付费 | 如果重视隐私 |
| Umami | 自托管、开源 | 需自己部署 | 技术用户 |
| Cloudflare Web Analytics | 免费、无脚本 | 基础 | 快速上手 |

建议：**Google Analytics 4 + Cloudflare Web Analytics** 双轨并行。

---

## 今日行动

1. 注册 GA4 并获取测量 ID。
2. 在 `index.html` 和 `en/index.html` 添加 gtag 脚本。
3. 配置 Cloudflare Web Analytics。
4. 定义并埋点核心事件。
5. 创建数据看板（GA4 探索报告或简单表格）。
6. 写第一篇周复盘。
