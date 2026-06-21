# 知乎回答

## 选择回答的问题

在知乎搜索以下问题，选择 3–5 个回答：

1. 有哪些让人眼前一亮的小网站？
2. 你见过哪些厉害的网站？
3. 有哪些适合天文爱好者的网站/APP？
4.  NASA 有哪些好用的公开数据？
5.  有哪些让你感叹人类创造力的网站？
6.  如何向孩子解释太阳系有多大？

---

## 回答正文（通用模板）

最近做了一个项目，必须分享：

**遨游太阳系（Solar Wanderer）**：https://sw.icodestar.net

这是一个基于真实 NASA JPL 星历的浏览器端 1:1 太阳系探索应用。手机、电脑、平板都能打开，不用安装，不用注册。

**它最让我震撼的几个体验：**

1. **站在月球看地球**
   降落在月球表面，转过身，漆黑的天空中挂着一颗小小的蓝色弹珠。那一刻你会理解为什么阿波罗宇航员回来后都说“我们再也无法平静”。

2. **从地球缩放到奥尔特云**
   一直把画面拉远，地球先是变成蓝点，然后消失，最后连太阳都变得渺小。整个太阳系直径超过 3 光年。

3. **火星上的蓝色日落**
   因为火星尘埃的散射特性，日落不是红色，而是蓝色。这在 app 里也能看到。

4. **土星环的真实阴影**
   土星环会投下真实的影子到土星本体上，这是卡西尼号拍摄的经典画面。

**技术上：**

- 用 NASA JPL Standish 元素计算行星位置，和 JPL Horizons 对照误差小于 0.074°。
- 用浮动原点 + 对数深度缓冲实现 1:1 真实尺度。
- 纯前端，压缩后约 200KB，MIT 开源。

项目是开源的（https://github.com/hyqzz/Solar-Wanderer），也在招募贡献者：真实 DEM 地形、日月食、VR、科普课程、多语言翻译等等。

如果你也好奇宇宙，点开看看。我建议你第一件事：飞到月球，降落，抬头找地球。

---

## 回答技巧

- 不要只发链接，要讲故事和体验。
- 配图 3–5 张：
  - [`moon-earthrise_1920x1080.png`](../assets/screenshots/moon-earthrise_1920x1080.png)
  - [`saturn-rings_1920x1080.png`](../assets/screenshots/saturn-rings_1920x1080.png)
  - [`mars-sunset_1920x1080.png`](../assets/screenshots/mars-sunset_1920x1080.png)
  - [`earth-orbit_1920x1080.png`](../assets/screenshots/earth-orbit_1920x1080.png)
- 可插入视频：[`main-demo-zh.mp4`](../assets/videos/main-demo-zh.mp4)
- 在结尾加一句互动："你最喜欢哪个天体？"
- 回答后 2 小时内回复前 10 条评论，提升权重。

---

## 变体：针对"如何向孩子解释太阳系"

带孩子打开这个网页：

1. 先站在地球上看太阳；
2. 飞到月球，让他转身找地球；
3. 把画面一直拉远，拉到奥尔特云；
4. 告诉他：如果把太阳系缩小到硬币大小，最近的恒星在 140 米外。

这种体验比任何课本插图都直观。

---

## 参考资料

- **土星环**：NASA Science https://science.nasa.gov/saturn/facts/
- **木星大红斑**：NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **火星蓝色日落**：NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **奥尔特云**：NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **阿波罗 8 号《地出》**：NASA https://www.nasa.gov/history/50-years-ago-apollo-8-in-lunar-orbit/

