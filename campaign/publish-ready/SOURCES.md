# Campaign 文案引用来源索引

> 本文件集中列出 campaign 所有发布文案中涉及的天文/科学事实的权威来源。复制发布时，可把对应链接附在描述、评论区或“Sources”段落。

---

## 土星环：宽 28.2 万公里，厚约 10 米

- **NASA Science – Saturn Facts**
  - URL: https://science.nasa.gov/saturn/facts/
  - 引用："Saturn's ring system extends up to 175,000 miles (282,000 kilometers) from the planet, yet the vertical height is typically about 30 feet (10 meters) in the main rings."
  - 说明：文案中“宽 28 万公里，厚 10–20 米”即来自该口径；10–20 米覆盖了主环不同区域的估算范围。

---

## 木星大红斑：比地球大，已存在 350 年以上

- **NASA Science – NASA's Juno Probes the Depths of Jupiter's Great Red Spot**
  - URL: https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
  - 引用：
    - "the Great Red Spot is 1.3 times as wide as Earth"
    - "the storm has been monitored since 1830, it has possibly existed for more than 350 years"
  - 说明：文案中“能装下地球”“存在至少 350 年”均据此。

---

## 火星日落呈蓝色：尘埃散射红光，蓝光穿透

- **NASA Science – What Do Sunrises and Sunsets Look Like on Mars?**
  - URL: https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
  - 引用：
    - "Fine dust in the atmosphere permits blue light to penetrate the atmosphere more efficiently than colors with longer wavelengths."
    - "The colors come from the fact that the very fine dust is the right size so that blue light penetrates the atmosphere slightly more efficiently... When the blue light scatters off the dust, it stays closer to the direction of the Sun than light of other colors does."
  - 说明：文案中“尘埃散射红光，蓝光留了下来”是该机制的口语化表达。

---

## 奥尔特云：太阳系边缘，约 10 万 AU

- **NASA Science – Oort Cloud: Facts**
  - URL: https://science.nasa.gov/solar-system/oort-cloud/facts/
  - 引用："with the outer edge being located somewhere between 10,000 and 100,000 AU from the Sun"
  - 说明：文案中“10 万 AU”取该范围上限，作为太阳系边缘的代表性数值。

---

## 应用自身精度声明

- **项目测试报告**：`docs/sdlc/test-report.md`
  - 说明：行星位置误差 ≤0.074°、月球 ≈0.12°、主要卫星 10 天内 ≤0.22° 等数据来自本项目的离线回归测试，与 NASA JPL Horizons 对比生成。
- **项目测试代码**：`tests/ephemeris.test.mjs`
  - 说明：可在本地运行 `npm test` 复现上述精度。

---

## 太阳：可装下 130 万个地球

- **NASA Science – Sun: Facts**
  - URL: https://science.nasa.gov/sun/facts/
  - 引用："it would take 1.3 million Earths to fill the Sun's volume"
  - 说明：短视频脚本“太阳能装下 130 万个地球”据此。

---

## 土卫六：地表有液态甲烷湖泊

- **NASA Science – Titan**
  - URL: https://science.nasa.gov/saturn/moons/titan/
  - 引用："Titan is the only place besides Earth known to have liquids on its surface. It has clouds, rain, rivers, lakes and seas of liquid hydrocarbons like methane and ethane."
  - 说明：文案中“土卫六有甲烷雨、甲烷河、甲烷湖”据此。

- **NASA Science – Dragonfly**
  - URL: https://science.nasa.gov/mission/dragonfly/
  - 引用："through the yellowish, smoggy haze of Titan's nitrogen-rich atmosphere"、"Dragonfly will stop at a variety of geologic sites, where it will collect samples of surface material for analysis"
  - 说明：文案中“NASA 蜻蜓号将登陆这里”据此。

---

## 冥王星心形平原：斯普特尼克平原，氮冰冰川

- **NASA Science – New Horizons**
  - URL: https://science.nasa.gov/mission/new-horizons/
  - 引用："Stunning photographs showed a vast heart-shaped nitrogen glacier (named Sputnik Planitia for Sputnik 1, Earth’s first artificial satellite) on the surface. It’s about 600 miles wide (1,000 kilometers), undoubtedly the largest known glacier in the solar system."
  - 说明：文案中“冥王星的心形平原是一片氮冰冰川”据此。

---

## 地出：阿波罗 8 号，1968 年 12 月 24 日

- **NASA – 50 Years Ago: Apollo 8 in Lunar Orbit**
  - URL: https://www.nasa.gov/history/50-years-ago-apollo-8-in-lunar-orbit/
  - 引用："the astronauts caught sight of the Earth appearing above the lunar limb. Anders snapped some of the most iconic photos of the Apollo program, first in black and white and then the more famous color Earthrise images."
  - 说明：文案中“1968 年阿波罗 8 号拍下《地出》”据此。

---

## 旅行者 1 号：飞得最远的探测器

- **NASA Science – Voyager 1**
  - URL: https://science.nasa.gov/mission/voyager/voyager-1/
  - 引用："No spacecraft has gone farther than NASA's Voyager 1"、"Voyager 1 crossed into interstellar space in August 2012"
  - 说明：文案中“人类飞得最远的探测器”据此。

---

## BGM 署名

- **Tunetank – Stasis (No Copyright Music)**
  - URL: https://youtu.be/ozb32hgHdo4
  - 署名格式：
    ```
    Song: Tunetank - Stasis (No Copyright Music)
    Music provided by Tunetank.
    Free Download: https://bit.ly/3sI19Af
    Video Link: https://youtu.be/ozb32hgHdo4
    ```
  - 详细说明见 `campaign/assets/music/CREDITS.md`。

---

## 使用建议

- 短视频发布：可在视频描述底部加一行 `Sources: NASA Science (links in comments)`，然后在评论区置顶来源。
- 长文/博客：在文中首次出现事实时插入对应链接，或在文末加“参考资料”。
- 社交平台字符受限时，优先保留 NASA Science 链接，并标注 `@NASA`。
