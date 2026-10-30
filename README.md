# brainstem-3d · 脑干 3D 交互模型

延髓 / 脑桥 / 中脑 + 12 对脑神经的交互式 3D 复习网站。为北师大《人体及动物生理学》实验报告I（脑干）任务二制作，结构与标注系统沿用 [human-skeleton-3d](https://github.com/dreamrain314/human-skeleton-3d) 的成熟模式。

**在线地址**：https://dreamrain314.github.io/brainstem-3d/

## 功能

- **3D 浏览**：旋转/缩放、点击结构查看说明、结构名称标签（药丸+引导线）、X 光透视、隔离查看、三剖面剖切（看内部核团/脑室）
- **结构标注**：橙点标注（锥体、锥体交叉、橄榄、薄/楔束结节、面神经丘、脚间窝…），点击出释义；`?edit=1` 进入编辑模式（双击加点/拖动微调/导出 JSON）
- **脑神经表**：CN III–XII 的核团、出入脑部位、功能、损伤表现；点行高亮 3D 双侧神经
- **任务二·三部分总结**：延髓/脑桥/中脑 × 外部结构/内部核团/纤维束/脑神经/功能 交互矩阵，条目点击定位 3D，一键导出 Markdown 抄进报告
- **自测模式**：看 3D 猜名称（4 选 1）/ 听名找结构（点模型作答），计分
- **标记与笔记**：重点标红、每结构笔记，localStorage 持久化，可导出/导入 JSON

## 模型来源

- 脑干外形：BodyParts3D 4.0（CC BY-SA 2.1 JP），见 [ATTRIBUTION.md](ATTRIBUTION.md)
- 脑神经：程序化示意管道（`_data/build_glb.py` 生成路径 → 前端 TubeGeometry）

## 本地运行

双击 `start.bat`（Windows），或在该目录执行 `python -m http.server 8091` 后访问 http://localhost:8091 。不要直接双击 index.html（file:// 无法加载 ES module 与模型）。

## 文件结构

```
index.html        页面 + 内联样式
app.js            全部逻辑（Three.js r160 本地 vendored，无构建）
store.js          localStorage 用户数据层
data/structures.json   结构元数据（节点ID → 中/英/拉丁名、分区、描述）
data/annotations.json  标注点（骨架站同 schema：rel 包围盒归一化 / pts 精确坐标）
data/nerves.json       脑神经 III–XII 详情
data/nerve-paths.json  神经管道控制点（构建脚本生成）
data/summary.json      任务二总结矩阵
models/brainstem.glb   合并模型（22 个命名节点）
_data/            离线管线（不部署）：build_glb.py、复核清单.md
```

## 更新流程

1. 改数据/代码 → 递增 `index.html` 与 `app.js`、模型引用里的 `?v=` 版本号
2. 本地验收 → commit + push → Pages 1-2 分钟后自动更新（CDN 缓存约 10 分钟）
