# UI 与沉浸感审查报告（ui-audit）

- 1. WebXR/导览/教师工具/书签/比例参照物/人体剪影等模块只实例化未接入 UI，无入口（main.js:246-289, 299；index.html 无对应 DOM）【高】
- 2. VR 实际不可用：无 VR 入口按钮、控制器回调未注册（main.js:283-289, webxr.js:90-105, 374）【高】
- 3. 音频默认静音、桌面仅 M 键、移动端无入口、HUD 无状态；audioEngine.setMode 缺 distSurface 导致 NaN（audio.js:31, 216; main.js:298, 775-780; touchControls.js 无音频按钮）【中】
- 4. TTS 旁白无法触发（仅在导览回调中调用，导览又无 UI）（main.js:268-270, tours.js）【中】
- 5. 导览仅 2 条；TeacherToolkit 传入数组导致 isActive 判断失效，课堂同步链接无法生成；Q&A 提示未本地化（tours.js:318-321, main.js:273-278, teacher.js:122, 152）【高】
- 6. 书签系统纯数据层无 UI，Ctrl+B 无动作（bookmarks.js:10-152, main.js:255, 299）【中】
- 7. 比例参照物/人体剪影有实现无调用方（scaleRef.js:71, 129; main.js:252, 834）【中】
- 8. es/ja/fr/de/ru 大量英文占位：天体名/事实卡片/帮助文档（i18n.js:287-291, 309; contentEn.js:88; eduFacts.js:380）【中】
- 9. 非中英语言启动屏标题完全消失（index.html:9-31, style.css:244-248）【中】
- 10. en/index.html noscript 与帮助弹窗静态内容残留中文（en/index.html:210-267, 131-149）【中】
- 11. 移动端无自由飞行入口（touchControls.js:458-476, 467）【中】
- 12. 标签无防重叠避让；恒星标签 pointer-events:none 不可选；字号不随距离缩放（labels.js:21-105, style.css:38）【低-中】
- 13. 桌面端无法隐藏右上信息面板（main.js:916-949）【低】
- 14. 可访问性：禁止缩放、canvas 无 aria-label、无 prefers-reduced-motion、按钮无 aria-label（index.html:5, 155; style.css:186-253）【低-中】
- 15. 加载失败无错误/取消状态，只卡"加载中…"（main.js:219, 103; index.html:217）【低】
