# V2EX 帖子

## 标题

我做了个网页，能让你站在月球上看地球

---

## 正文

大家好，

最近做了一个项目：**遨游太阳系（Solar Wanderer）**，一个基于真实 NASA JPL 星历的浏览器端 1:1 太阳系探索应用。

地址：https://sw.icodestar.net
GitHub：https://github.com/hyqzz/Solar-Wanderer

简单说，你打开手机或电脑，点开链接，就能：

- 从地球轨道一镜到底降落到月球表面，然后**抬头看地球**；
- 飞到火星，看蓝色的日落；
- 穿越土星环，看行星本影；
- 一直缩远，缩到奥尔特云，看整个太阳系变成一个小点。

所有天体的位置都是按真实星历实时计算的，不是动画循环摆出来的。行星位置误差小于 0.074°，可以和 JPL Horizons 实时对账。

项目是 MIT 开源的，纯前端，压缩后大概 200KB，不用装任何东西。

做这个项目的初衷是：我觉得人类迟早要走向星际，但在那之前，我们应该先真正“看见”自己的后院。 Solar Wanderer 想做这件事。

目前还在早期，很多想做的功能（真实 DEM 地形、日月食、VR、科普课程）都在 GitHub Issues 里招募贡献者。如果你感兴趣，欢迎来看看、提 issue、或者帮忙传播。

---

## 配图

- 第一张：`campaign/assets/social-cards/intro_zh_1080x1350.png`
- 第二张：`campaign/assets/screenshots/moon-earthrise_1920x1080.png`
- 第三张：`campaign/assets/screenshots/saturn-rings_1920x1080.png`
- 第四张：`campaign/assets/screenshots/jupiter-redspot_1920x1080.png`
- 可选视频：`campaign/assets/videos/short-moon-earthrise-zh.mp4`

---

## 发布节点

- 发到「分享创造」节点。
- 如果流量好，可以在评论区补充技术细节。

---

## 常见回复

**“手机能玩吗？”**

> 能，完整支持触控。双指捏合缩放，单指拖拽旋转，点目录里的天体可以直接飞过去。

**“数据来源是哪里？”**

> NASA JPL 星历，行星用 Standish 元素，月球用截断 ELP，卫星用 Horizons 状态向量拟合。可以跑 `npm run verify` 和 JPL 实时对账。

**“会开源吗？”**

> 已经 MIT 开源了，GitHub 地址在正文。

**“画质还能更好吗？”**

> 现在地形是程序噪声，真实 DEM 地形在做了（月球 LOLA、火星 MOLA）。贴图也在计划升级到 16K。

---

## 参考资料

- **土星环**：NASA Science https://science.nasa.gov/saturn/facts/
- **木星大红斑**：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **火星蓝色日落**：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **奥尔特云**：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **阿波罗 8 号《地出》**：NASA https://www.nasa.gov/history/50-years-ago-apollo-8-in-lunar-orbit/
