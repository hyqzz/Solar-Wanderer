# Schema Markup 建议

在 `index.html` 和 `en/index.html` 的 `<head>` 中加入以下 JSON-LD：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Solar Wanderer",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "Any",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "1"
  },
  "softwareVersion": "2.1.0",
  "downloadUrl": "https://sw.icodestar.net",
  "url": "https://sw.icodestar.net",
  "description": "A free, open-source, browser-based 1:1 scale solar system explorer built on NASA JPL ephemerides.",
  "author": {
    "@type": "Person",
    "name": "hyqzz"
  },
  "license": "https://opensource.org/licenses/MIT",
  "sourceOrganization": {
    "@type": "Organization",
    "name": "Solar Wanderer Open Source Project"
  }
}
</script>
```

---

## 视频对象 Schema（用于 YouTube 嵌入页）

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Solar Wanderer Demo",
  "description": "A 60-second tour of the Solar Wanderer solar system explorer.",
  "thumbnailUrl": "https://sw.icodestar.net/assets/demo-thumb.jpg",
  "uploadDate": "2026-06-15",
  "contentUrl": "https://youtu.be/3rwShi6oF0o"
}
</script>
```

---

## FAQ Schema（用于 SEO 页面）

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Solar Wanderer free?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. Solar Wanderer is free, open source, and runs in your browser with no installation."
      }
    },
    {
      "@type": "Question",
      "name": "How accurate are the planet positions?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Planetary positions match NASA JPL Horizons within approximately 0.1 degrees."
      }
    }
  ]
}
</script>
```

---

## 提交站点地图

- Google Search Console: https://search.google.com/search-console
- Bing Webmaster Tools: https://www.bing.com/webmasters

站点地图 URL：`https://sw.icodestar.net/sitemap.xml`
（如未生成，可先用 `https://sw.icodestar.net` 手动提交。）
