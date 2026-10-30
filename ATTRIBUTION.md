# 数据来源与许可（ATTRIBUTION）

## 3D 模型

**主体几何**：BodyParts3D / Anatomography（© The Database Center for Life Science, Research Organization of Information and Systems, Japan）
- 来源：https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- 许可：**CC Attribution-Share Alike 2.1 Japan**（CC BY-SA 2.1 JP）
- 引用：Mitsuhashi N. et al. (2009) *BodyParts3D: 3D structure database for anatomical concepts*. Nucleic Acids Res. 37:D782–785. https://doi.org/10.1093/nar/gkn613
- 使用的部件（FJ 文件号）：延髓 FJ1769/FJ1831、脑桥 FJ1775/FJ1822、中脑 FJ1770/FJ1817、大脑脚 FJ1774/FJ1821、上丘 FJ1779/FJ1826、下丘 FJ1762/FJ1810、第四脑室 FJ1731、丘脑 FJ1782/FJ1827、下丘脑 FJ1760、乳头体 FJ1768、松果体 FJ1795、视交叉 FJ1771、视神经 FJ1313/FJ1364、视束 FJ1773/FJ1820、小脑 FJ1781/FJ1830

**脑神经（CN III–XII）管道**：本项目按标准解剖走行程序化生成（Three.js TubeGeometry），出口点与走样控制点由延髓/脑桥/中脑网格包围盒推算（见 `_data/build_glb.py` 的 `emit_nerve_paths`）。示意性质，非真实纤维束重建。

**改编说明**（CC BY-SA 要求）：对 BodyParts3D 网格做了左右半合并、坐标轴变换（BP3D 全身空间 → three.js Y-up）、居中与等比缩放（高约 2.2 单位）。按同方式共享要求，本网站的改编模型继续以 CC BY-SA 2.1 JP 对外提供。

## 文字内容

- 结构描述、脑神经要点、任务二总结矩阵：按王玢/左明雪《人体及动物生理学》与 Gray's Anatomy 口径整理，**发布前需人工逐条复核**（见 `_data/复核清单.md`）。
- 程序：原创（MIT），Three.js r160（MIT License, © 2010-2024 three.js authors）。

## 免责声明

本网站为教学复习用途的解剖示意，不构成医学建议；网格经多边形简化（BodyParts3D 99% reduction），外形为近似，不应作为临床或精细科研依据。
