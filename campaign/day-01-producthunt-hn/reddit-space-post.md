# Reddit r/space 帖子

## 标题

I built a free, browser-based 1:1 solar system explorer using real NASA data. Here's what it looks like to stand on the Moon and watch Earth rise.

---

## 正文

Hey r/space,

I’ve spent the last few weeks building **Solar Wanderer** — a free, open-source web app that lets you explore the real solar system at true 1:1 scale.

It’s not a game that compresses distances for convenience. It uses actual NASA JPL ephemerides, so every planet and moon is where it really is right now. You can verify it yourself against JPL Horizons.

**Try it:** https://sw.icodestar.net

**Source:** https://github.com/hyqzz/Solar-Wanderer

Some things you can do:

- Zoom from Earth orbit straight down to the surface and walk around.
- Land on the Moon and watch Earth rise over the horizon.
- Fly through Saturn’s rings and see their real shadows on the planet.
- Pull back until the entire inner solar system is a dot and the Oort Cloud appears.
- Walk on Mars, Europa, Titan, Pluto, and 14 other worlds with real surface gravity.

It runs in any browser, on desktop and mobile, no install needed. The whole thing is ~200 KB gzipped.

The moment that got me: standing on the Moon, turning around, and seeing Earth as that tiny blue marble. I think more people should experience that.

Would love your thoughts — especially if anything looks scientifically off.

---

## 图片/GIF

- 主图：`campaign/assets/screenshots/moon-earthrise_1920x1080.png`
- 可选 GIF/视频：`campaign/assets/videos/short-moon-earthrise-en.mp4`（12 秒）

---

## 发布技巧

- r/space 喜欢真实数据和科学准确性，不要过度营销。
- 标题要具体、有画面感。
- 发布后 2 小时内回复评论，尤其是指出科学细节的人。
- 如果热度好，可以 cross-post 到 r/astronomy。

---

## 常见评论回复

**“This is amazing!”**

> Thank you! If you try it, the most emotional view is landing on the Moon and looking back at Earth. Let me know what you think.

**“How accurate is it?”**

> Planetary positions are within 0.074° of JPL Horizons, the Moon within ~0.12°. You can run `npm run verify` in the repo to see it cross-check live.

**“Can I use this in my classroom?”**

> Absolutely, that’s one of the main goals. It’s free, open source, and works on any device. We’re also building guided tours for educators.

**“The terrain looks procedural.”**

> You’re right — current terrain is procedural noise blended with real albedo. Real DEM streaming (LOLA for Moon, MOLA for Mars) is the top priority on our roadmap.

**“It lags on my phone.”**

> The app auto-detects GPU tier and lowers quality on weaker devices. You can also try `?quality=lite` in the URL. If it still lags, please tell me your device and browser.

---

## Sources / 素材引用

- **Saturn rings** (280,000 km wide, ~10 m thick): NASA Science https://science.nasa.gov/saturn/facts/
- **Jupiter Great Red Spot** (1.3× Earth, 350+ years): NASA Science / Juno https://science.nasa.gov/missions/juno/nasas-juno-probes-the-depths-of-jupiters-great-red-spot/
- **Blue sunsets on Mars**: NASA Science https://science.nasa.gov/solar-system/planets/mars/what-does-a-sunrise-sunset-look-like-on-mars/
- **Oort Cloud** (~100,000 AU): NASA Science https://science.nasa.gov/solar-system/oort-cloud/facts/
- **Apollo 8 Earthrise**: NASA https://www.nasa.gov/history/50-years-ago-apollo-8-in-lunar-orbit/
