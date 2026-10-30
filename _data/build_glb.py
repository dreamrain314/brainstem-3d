# -*- coding: utf-8 -*-
"""
brainstem-3d 模型管线：BP3D OBJ -> models/brainstem.glb

来源: BodyParts3D 4.0 (isa_BP3D_4.0_obj_99.zip), CC Attribution-Share Alike 2.1 Japan
坐标系: BP3D 全身空间 (x=左右+为解剖左, y=前后-为前, z=上下+为上, 单位约 mm)
输出:  three.js 空间 (y 向上), 中脑+脑桥+延髓核心居中, 高度归一化到 ~2.2
"""
import os
import numpy as np
import trimesh

SRC = os.path.join(os.path.dirname(__file__), 'bp3d')
OUT = os.path.join(os.path.dirname(__file__), '..', 'models', 'brainstem.glb')

# 节点ID -> FJ 文件 (R/L 半按 x 符号归侧; +x = 解剖左)
GROUPS = {
    'BS-MED':    ['FJ1769', 'FJ1831'],   # 延髓 medulla oblongata (R+L)
    'BS-PON':    ['FJ1775', 'FJ1822'],   # 脑桥 pons (R+L)
    'BS-MID':    ['FJ1770', 'FJ1817'],   # 中脑 midbrain (不含大脑脚与四叠体)
    'BS-CRUS-L': ['FJ1774'],             # 大脑脚(左) crus cerebri
    'BS-CRUS-R': ['FJ1821'],
    'SC-SUP-L':  ['FJ1779'],             # 上丘(左)
    'SC-SUP-R':  ['FJ1826'],
    'SC-INF-L':  ['FJ1762'],             # 下丘(左)
    'SC-INF-R':  ['FJ1810'],
    'DTH-L':     ['FJ1782'],             # 丘脑(左) — 定位参考
    'DTH-R':     ['FJ1827'],
    'HYP':       ['FJ1760'],             # 下丘脑 — 定位参考
    'MAM':       ['FJ1768'],             # 乳头体
    'PINEAL':    ['FJ1795'],             # 松果体
    'OPT-CHI':   ['FJ1771'],             # 视交叉
    'OPT-N-L':   ['FJ1313'],             # 视神经(左) = CN II
    'OPT-N-R':   ['FJ1364'],
    'OPT-TR-L':  ['FJ1773'],             # 视束(左)
    'OPT-TR-R':  ['FJ1820'],
    'V4':        ['FJ1731'],             # 第四脑室
    'CBL':       ['FJ1781', 'FJ1830'],   # 小脑 — 定位参考, 前端默认隐藏
}

# BP3D -> three.js: (x, y, z) -> (x, z, -y)
FLIP = np.array([
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, -1, 0, 0],
    [0, 0, 0, 1],
], dtype=np.float64)


def load(fj):
    m = trimesh.load(os.path.join(SRC, fj + '.obj'), force='mesh', process=True)
    m.apply_transform(FLIP)
    return m


def main():
    groups = {}
    for gid, fjs in GROUPS.items():
        parts = [load(fj) for fj in fjs]
        merged = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
        groups[gid] = merged
        print('%-10s v=%-6d f=%-6d' % (gid, len(merged.vertices), len(merged.faces)))

    # 核心(延髓+脑桥+中脑+大脑脚)包围盒 -> 居中与缩放基准
    core = trimesh.util.concatenate([groups[g] for g in
                                     ('BS-MED', 'BS-PON', 'BS-MID',
                                      'BS-CRUS-L', 'BS-CRUS-R')])
    lo, hi = core.bounds
    center = (lo + hi) / 2
    scale = 2.2 / (hi - lo)[1]   # y=three.js 高度轴
    print('core bounds(y up):', np.round(lo, 2), np.round(hi, 2), 'scale=%.5f' % scale)

    scene = trimesh.Scene()
    T = {}   # 变换后(模型空间)的网格, x=左右(+解剖左), y=上, z=前
    for gid, m in groups.items():
        m2 = m.copy()
        m2.apply_translation(-center)
        m2.apply_scale(scale)
        T[gid] = m2
        scene.add_geometry(m2, node_name=gid, geom_name=gid)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scene.export(OUT)
    print('wrote', OUT, '%.1f KB' % (os.path.getsize(OUT) / 1024))
    emit_nerve_paths(T)


def emit_nerve_paths(T):
    """按各节点实际包围盒计算 12 对脑神经(III-XII)的出口点与走样控制点。
    输出 data/nerve-paths.json: {nerveId: {pts:[[x,y,z]...], r:半径}}，神经管在网页端
    用 THREE.CatmullRomCurve3 + TubeGeometry 运行时生成。坐标依据标准解剖：
      III 脚间窝 / IV 下丘下方绕外侧 / V 脑桥中部外侧 / VI 桥延沟内侧 /
      VII,VIII 桥延沟外侧(脑桥小脑角) / IX,X,XI 橄榄后沟 / XII 橄榄前沟 """
    import json
    bb = {k: dict(zip(('xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax'),
                      (v.bounds[0][0], v.bounds[1][0], v.bounds[0][1],
                       v.bounds[1][1], v.bounds[0][2], v.bounds[1][2])))
          for k, v in T.items()}
    med, pon, mid, crus = bb['BS-MED'], bb['BS-PON'], bb['BS-MID'], bb['BS-CRUS-L']
    hh = lambda b: b['ymax'] - b['ymin']
    zf = lambda b: b['zmax']                     # 前表面
    xw = max(pon['xmax'], med['xmax'])           # 半宽

    N = {}
    def nerve(nid, pts, r):
        N[nid] = {'pts': [[round(x, 4) for x in p] for p in pts], 'r': r}

    y3 = mid['ymin'] + 0.22 * hh(mid)            # III: 中脑腹侧下部(脚间窝)
    z3 = zf(crus) + 0.01
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-III-' + s, [
            [sx * 0.10, y3, z3],
            [sx * 0.16, y3 - 0.02, z3 + 0.10],
            [sx * 0.38, y3 - 0.10, z3 + 0.30],
            [sx * 0.52, y3 - 0.16, z3 + 0.42]], 0.024)
    # IV: 下丘下方尾侧出脑, 绕大脑脚外侧走向腹侧
    y4 = mid['ymin'] + 0.12 * hh(mid)
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-IV-' + s, [
            [sx * 0.05, y4, mid['zmin'] - 0.02],
            [sx * 0.30, y4 + 0.02, mid['zmin'] + 0.02],
            [sx * 0.48, y4 - 0.02, (mid['zmin'] + zf(crus)) / 2],
            [sx * 0.46, y4 - 0.10, zf(crus) + 0.28]], 0.013)
    # V: 脑桥中部腹外侧
    y5 = pon['ymin'] + 0.62 * hh(pon)
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-V-' + s, [
            [sx * xw * 0.80, y5, pon['zmin'] + 0.42 * (zf(pon) - pon['zmin'])],
            [sx * xw * 1.25, y5 - 0.02, zf(pon) - 0.06],
            [sx * xw * 1.60, y5 - 0.06, zf(pon) + 0.10],
            [sx * xw * 1.85, y5 - 0.10, zf(pon) + 0.22]], 0.033)
    # VI: 桥延沟, 内侧
    y6 = pon['ymin'] + 0.02
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-VI-' + s, [
            [sx * 0.09, y6, zf(med) + 0.01],
            [sx * 0.13, y6 + 0.05, zf(med) + 0.18],
            [sx * 0.22, y6 + 0.14, zf(med) + 0.34],
            [sx * 0.30, y6 + 0.24, zf(med) + 0.44]], 0.018)
    # VII / VIII: 脑桥小脑角, VII 内侧上, VIII 外侧下
    ycpa = pon['ymin'] + 0.10
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-VII-' + s, [
            [sx * xw * 0.60, ycpa, med['zmax'] * 0.3],
            [sx * xw * 0.95, ycpa + 0.02, med['zmax'] * 0.3 + 0.03],
            [sx * xw * 1.25, ycpa + 0.05, med['zmax'] * 0.3 + 0.06],
            [sx * xw * 1.45, ycpa + 0.06, med['zmax'] * 0.3 + 0.05]], 0.020)
        nerve('CN-VIII-' + s, [
            [sx * xw * 0.72, ycpa - 0.05, med['zmax'] * 0.3 - 0.02],
            [sx * xw * 1.10, ycpa - 0.05, med['zmax'] * 0.3 + 0.02],
            [sx * xw * 1.40, ycpa - 0.02, med['zmax'] * 0.3 + 0.05],
            [sx * xw * 1.60, ycpa + 0.01, med['zmax'] * 0.3 + 0.06]], 0.022)
    # IX / X / XI: 橄榄后沟自上而下
    yol = med['ymin'] + 0.52 * hh(med)
    xol = med['xmax'] * 0.88
    for i, (nid, dy, r) in enumerate((('CN-IX', 0.00, 0.016),
                                      ('CN-X', -0.09, 0.018),
                                      ('CN-XI', -0.18, 0.017))):
        for s, sx in (('L', 1), ('R', -1)):
            nerve(nid + '-' + s, [
                [sx * xol, yol + dy, med['zmin'] + 0.62 * (med['zmax'] - med['zmin'])],
                [sx * xol + sx * 0.14, yol + dy - 0.01, med['zmax'] * 0.55],
                [sx * (xol + 0.28), yol + dy - 0.05, med['zmax'] * 0.35],
                [sx * (xol + 0.38), yol + dy - 0.12, med['zmax'] * 0.18]], r)
    # XII: 橄榄前沟(锥体与橄榄之间), 2-3 根合并走前外
    y12 = med['ymin'] + 0.38 * hh(med)
    for s, sx in (('L', 1), ('R', -1)):
        nerve('CN-XII-' + s, [
            [sx * xol * 0.55, y12 + 0.06, zf(med) - 0.01],
            [sx * xol * 0.62, y12 - 0.02, zf(med) + 0.10],
            [sx * (xol + 0.16), y12 - 0.10, zf(med) + 0.24],
            [sx * (xol + 0.26), y12 - 0.20, zf(med) + 0.30]], 0.019)

    out = os.path.join(os.path.dirname(__file__), '..', 'data', 'nerve-paths.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(N, f, ensure_ascii=False, indent=1)
    print('wrote', out, '-', len(N), 'nerve tubes')


if __name__ == '__main__':
    main()
