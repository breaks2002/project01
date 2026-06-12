应用图标说明
=============

请将以下文件放入此目录：

- icon.ico    (256x256 Windows 图标，用于 exe 文件)

生成图标的方法：
1. 使用在线工具如 https://icoconvert.com/ 转换 PNG 到 ICO
2. 或使用 ImageMagick: convert icon.png -resize 256x256 icon.ico
3. 或使用 Visual Studio 的图标编辑器

推荐规格：
- 尺寸: 256x256 (包含 16x16, 32x32, 48x48, 64x64 等多尺寸)
- 格式: ICO (Windows 标准)
- 颜色: 32位 (支持透明通道)