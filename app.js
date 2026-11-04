import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { store } from './store.js';

/* ============ 全局状态 ============ */
const state = {
  structs: null,        // sid -> {cn, latin, desc, region, group, en}
  nerves: null,         // 概念ID(CN-III…) -> 脑神经详情
  meshes: [],           // {mesh, sid}
  bySid: new Map(),     // sid -> [mesh]
  selected: null,
  hovered: null,
  regionVisible: {},
  showLabel: true,
  xray: false,
  spin: false,
  keyMode: false,
  onlyKey: false,
  keySet: new Set(),
  hiddenSet: new Set(),
  ann: null,            // sid -> [结构标注条目]
  annSprites: [],
  annEdit: null,
  annSel: null,
  editMode: false,
  isolated: null,
  annOp: 0.5,
  clip: { axis: null, pos: 0.5, invert: false },
  modelBox: null,
  panY: 0,
  homeDist: 0,
  panRange: 1,
  nerveType: {},        // sid(CN-III-L…) -> motor|sensory|mixed
  dockOpen: false,
  task1: null,          // 任务一答案数据
  t1Revealed: new Set(),
  quiz: { active: false, mode: 'name', target: null, answered: false, right: 0, total: 0 },
};
const REGIONS = ['延髓', '脑桥', '中脑', '脑神经', '脑室系统', '参考结构'];
/* 默认隐藏参考结构（丘脑/下丘脑/小脑等非脑干定位参考），需要时在分区列表点开 */
const REGIONS_DEFAULT_OFF = ['参考结构'];

/* 外观：脑干本体用神经组织灰粉，脑神经按功能分色，参考结构偏冷灰 */
const BASE_COLOR = new THREE.Color(0xd9c4bd);
const REF_COLOR = new THREE.Color(0xaab6c6);     // 参考结构（间脑/小脑等）
const SEL_COLOR  = new THREE.Color(0x3d82cc);
const HOV_COLOR  = new THREE.Color(0x4da3ff);
const KEY_COLOR  = new THREE.Color(0xff7043);
const QUIZ_COLOR = new THREE.Color(0xffd54f);    // 自测模式目标结构高亮
const XRAY_OPACITY = 0.30;
const XRAY_TINT  = new THREE.Color(0x9fd8e8);
const SEL_EMISSIVE = new THREE.Color(0x0e2a4d);
const XRAY_EMISSIVE = new THREE.Color(0x16404d);
const QUIZ_EMISSIVE = new THREE.Color(0x4a3a00);
const NO_EMISSIVE  = new THREE.Color(0x000000);

const NERVE_COLORS = {
  motor:   new THREE.Color(0xd96a4b),   // 运动性（暖橘红）
  sensory: new THREE.Color(0x3e9fd0),   // 感觉性（青蓝）
  mixed:   new THREE.Color(0x9a5cb5),   // 混合性（紫）
};

const MAT = { roughness: 0.55, metalness: 0.0, envMapIntensity: 1.0, flatShading: false };

/* ============ 场景 ============ */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
scene.fog = new THREE.Fog(0x0b0e14, 12, 40);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0.9, 0.35, 2.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.3;
controls.minDistance = 0.15;
controls.maxDistance = 6;
controls.target.set(0, 0, 0);
controls.autoRotateSpeed = 0.8;
controls.enablePan = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

/* ============ 灯光与环境 ============ */
scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x2a2418, 0.38));
const key = new THREE.DirectionalLight(0xfff6e8, 2.1); key.position.set(3, 5, 4); scene.add(key);
const fill = new THREE.DirectionalLight(0xa8c6ff, 0.6); fill.position.set(-4, 1, -3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(0, -3, 2); scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xffe9cf, 0.55); rim2.position.set(-2, 2, -4); scene.add(rim2);

function buildStudioEnvScene() {
  const envScene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(14, 14);
  const panel = (hex, intensity, pos, rot) => {
    const mat = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
    mat.color.multiplyScalar(intensity);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    envScene.add(m);
  };
  panel(0xffffff, 3.6, [0, 7, 0], [Math.PI / 2, 0, 0]);
  panel(0xfff2df, 1.15, [0, 0.6, 7], [0, 0, 0]);
  panel(0xdce8ff, 1.15, [-7, 1, 0], [0, Math.PI / 2, 0]);
  panel(0xffe7d3, 1.05, [7, 1, 0], [0, -Math.PI / 2, 0]);
  panel(0x2b303b, 0.8, [0, -7, 0], [-Math.PI / 2, 0, 0]);
  return { scene: envScene, geo };
}
function setupEnvironment() {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const { scene: envScene, geo } = buildStudioEnvScene();
    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;
    pmrem.dispose();
    envScene.traverse(o => { if (o.isMesh) o.material.dispose(); });
    geo.dispose();
  } catch (e) {
    console.warn('环境贴图生成失败，已回退到纯灯光照明：', e);
  }
}

/* ============ UI 引用 ============ */
const $ = id => document.getElementById(id);
const infoEl = $('info'), hoverEl = $('hover');
const loaderEl = $('loader'), barEl = $('bar'), loadTxt = $('loadTxt');

const fetchJSON = (url, fallback) => fetch(url, { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.json(); })
  .catch(() => fallback);

/* ============ 启动 ============ */
async function boot() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
      loadTxt.innerHTML = '当前浏览器/环境不支持 WebGL，无法显示 3D 模型。<br>' +
        '请使用最新版 Chrome / Edge / Firefox 打开本页面。';
      document.querySelector('#loader .spin').style.display = 'none';
      return;
    }

    state.structs = await fetchJSON('./data/structures.json?v=20261030a', null);
    if (!state.structs) throw new Error('structures.json 加载失败');
    store.init();
    state.keySet = new Set(store.getMarked());
    try {
      let op = parseFloat(localStorage.getItem('bs3d-ann-op'));
      if (!isNaN(op)) {
        if (op > 1) op = op / 100;
        state.annOp = Math.min(1, Math.max(0.15, op));
      }
    } catch (e) {}
    state.ann = await fetchJSON('./data/annotations.json?v=20261030a', {});
    state.nerves = await fetchJSON('./data/nerves.json?v=20261104b', {});
    state.editMode = new URLSearchParams(location.search).has('edit');
    if (state.editMode) {
      const eb = document.getElementById('editBar');
      eb.classList.add('show');
      eb.innerHTML = '标注编辑模式 —— 双击结构面：新增/移动 · 拖动标注可微调 · 单击选结构 · ' +
        '<span id="annExport">导出标注数据</span>';
      document.getElementById('annExport').onclick = exportAnnotations;
    }

    // 模型加载（未压缩 GLB，无需 Draco）
    const gltf = await new Promise((res, rej) => {
      new GLTFLoader().load('./models/brainstem.glb?v=20261030a', res,
        p => {
          if (p.total) {
            const pct = Math.min(100, p.loaded / p.total * 100).toFixed(0);
            barEl.style.width = pct + '%';
            loadTxt.textContent = `正在加载脑干模型… ${pct}%`;
          }
        },
        err => rej(new Error('模型加载失败: ' + (err.message || err.type || '未知错误'))));
    });

    setupEnvironment();

    const model = gltf.scene;
    model.updateMatrixWorld(true);
    model.traverse(o => {
      if (o.isMesh) {
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        if (!o.geometry.attributes.uv) {
          const count = o.geometry.attributes.position.count;
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        const sid = (o.name || o.parent?.name || '').replace(/_\d+$/, '');
        o.userData.sid = sid;
        o.material = new THREE.MeshPhysicalMaterial(Object.assign({ color: BASE_COLOR.clone() }, MAT));
        state.meshes.push({ mesh: o, sid });
        if (!state.bySid.has(sid)) state.bySid.set(sid, []);
        state.bySid.get(sid).push(o);
      }
    });

    // 程序化脑神经（III–XII 左右共 20 根管）
    await buildNerveTubes();

    // 居中到原点 + 适配相机
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    scene.add(model);
    model.updateMatrixWorld(true);
    state.modelBox = new THREE.Box3().setFromObject(model);

    const maxDim = Math.max(size.x, size.y, size.z);
    controls.minDistance = maxDim * 0.012;
    controls.maxDistance = maxDim * 6;
    camera.position.set(maxDim * 0.42, maxDim * 0.16, maxDim * 1.18);
    controls.target.set(0, 0, 0);
    controls.update();
    state.homeDist = camera.position.length();
    state.panRange = Math.max(size.y, maxDim) * 0.6;
    scene.fog.near = controls.maxDistance * 1.5;
    scene.fog.far = controls.maxDistance * 4;

    $('cnt').textContent = state.bySid.size;
    $('quizCnt').textContent = quizPool().length;
    buildRegionUI();
    applyVisibility();   // 让「参考结构」默认关闭立即生效
    buildNerveTable();
    buildSummary();
    buildTask1();
    bindUI();
    bindDock();
    bindTask1();
    bindQuiz();
    const fold = document.getElementById('annFold');
    if (fold) fold.addEventListener('click', () => {
      const list = document.getElementById('annList');
      const open = list.style.display !== 'none';
      list.style.display = open ? 'none' : 'flex';
      document.getElementById('annFoldArr').textContent = open ? '▸ 展开' : '▾ 收起';
    });
    animate();
    setTimeout(() => loaderEl.classList.add('hide'), 250);
  } catch (err) {
    console.error(err);
    loadTxt.textContent = '加载失败：' + err.message;
  }
}

/* ============ 程序化脑神经 ============ */
async function buildNerveTubes() {
  const paths = await fetchJSON('./data/nerve-paths.json?v=20261030a', null);
  if (!paths) return;
  // 概念 -> 纤维类型（混合 > 感觉 > 运动优先级判断）
  for (const [cid, n] of Object.entries(state.nerves)) {
    const t = n.type || '';
    const kind = t.includes('混合') ? 'mixed' : (t.includes('感觉') ? 'sensory' : 'motor');
    for (const s of ['L', 'R']) state.nerveType[`${cid}-${s}`] = kind;
  }
  for (const [sid, def] of Object.entries(paths)) {
    const pts = def.pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    const geo = new THREE.TubeGeometry(curve, 40, def.r || 0.02, 10, false);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial(Object.assign({
      color: NERVE_COLORS[state.nerveType[sid] || 'motor'].clone(),
    }, MAT)));
    mesh.userData.sid = sid;
    mesh.userData.nerve = true;
    scene.add(mesh);
    state.meshes.push({ mesh, sid });
    state.bySid.set(sid, [mesh]);
  }
}

/* ============ 区域面板 ============ */
function buildRegionUI() {
  const byRegion = {};
  for (const sid of state.bySid.keys()) {
    const b = state.structs[sid] || { region: '其他', group: '其他' };
    (byRegion[b.region] = byRegion[b.region] || []).push({ sid, group: b.group || '其他' });
  }
  const wrap = $('regions');
  wrap.innerHTML = '';
  REGIONS.forEach(r => {
    state.regionVisible[r] = !REGIONS_DEFAULT_OFF.includes(r);
    const items = byRegion[r] || [];
    const groups = [];
    for (const it of items) {
      let g = groups.find(x => x.name === it.group);
      if (!g) { g = { name: it.group, sids: [] }; groups.push(g); }
      g.sids.push(it.sid);
    }
    const d = document.createElement('div');
    d.className = 'reg' + (state.regionVisible[r] ? '' : ' off');
    d.innerHTML = `<span class="dot"></span><span class="reg-name">${r}</span>` +
      `<span class="n">${items.length}</span><span class="chev">▸</span>`;
    d.onclick = () => {
      state.regionVisible[r] = !state.regionVisible[r];
      d.classList.toggle('off', !state.regionVisible[r]);
      applyVisibility();
    };
    d.querySelector('.chev').onclick = e => {
      e.stopPropagation();
      d.classList.toggle('open');
    };
    const listBox = document.createElement('div');
    listBox.className = 'reg-list';
    if (items.length > 30) {
      const filter = document.createElement('input');
      filter.className = 'reg-filter';
      filter.type = 'text';
      filter.placeholder = `筛选${r}结构…`;
      filter.onclick = e => e.stopPropagation();
      filter.oninput = () => {
        const q = filter.value.trim();
        listBox.classList.toggle('searching', !!q);
        listBox.querySelectorAll('.bone-item').forEach(it => {
          it.style.display = !q || it.textContent.includes(q) ? '' : 'none';
        });
      };
      listBox.appendChild(filter);
    }
    groups.forEach(g => {
      const sub = document.createElement('div');
      sub.className = 'reg-sub';
      sub.innerHTML = `<span class="chev">▸</span><span>${g.name}</span>` +
        `<span class="n">${g.sids.length}</span>`;
      const grp = document.createElement('div');
      grp.className = 'reg-group';
      g.sids.forEach(sid => {
        const b = state.structs[sid];
        const item = document.createElement('div');
        item.className = 'bone-item' + (state.hiddenSet.has(sid) ? ' hid' : '');
        item.dataset.sid = sid;
        item.innerHTML = (state.keySet.has(sid) ? '<span class="star">★</span>' : '') +
          `<span>${b?.cn || sid}</span>`;
        item.title = b?.en || sid;
        item.onclick = e => {
          e.stopPropagation();
          selectBone(sid);
        };
        item.ondblclick = e => {
          e.stopPropagation();
          enterIsolate(sid);
        };
        grp.appendChild(item);
      });
      sub.onclick = e => {
        e.stopPropagation();
        sub.classList.toggle('open');
      };
      listBox.appendChild(sub);
      listBox.appendChild(grp);
    });
    wrap.appendChild(d);
    wrap.appendChild(listBox);
  });
}

function applyVisibility() {
  state.meshes.forEach(({ mesh, sid }) => {
    const r = state.structs[sid]?.region || '其他';
    const regionOk = state.regionVisible[r] !== false;
    const markOk = !state.onlyKey || state.keySet.has(sid);
    const notHidden = !state.hiddenSet.has(sid);
    const isolateOk = !state.isolated || state.isolated === sid;
    mesh.visible = regionOk && markOk && notHidden && isolateOk;
  });
}

/* ============ UI 交互 ============ */
function bindUI() {
  $('btnLabel').onclick = e => {
    state.showLabel = !state.showLabel;
    e.currentTarget.classList.toggle('on', state.showLabel);
    if (state.selected) state.showLabel ? placeLabel(state.selected) : removeLabel();
  };
  $('btnXray').onclick = e => {
    state.xray = !state.xray;
    e.currentTarget.classList.toggle('on', state.xray);
    updateMaterials();
  };
  $('btnKey').onclick = e => {
    state.keyMode = !state.keyMode;
    e.currentTarget.classList.toggle('on', state.keyMode);
    if (!state.keyMode && state.onlyKey) {
      state.onlyKey = false;
      $('btnOnlyKey').classList.remove('on');
      applyVisibility();
    }
    updateMaterials();
  };
  $('btnOnlyKey').onclick = e => {
    state.onlyKey = !state.onlyKey;
    e.currentTarget.classList.toggle('on', state.onlyKey);
    if (state.onlyKey && !state.keyMode) {
      state.keyMode = true;
      $('btnKey').classList.add('on');
      updateMaterials();
    }
    applyVisibility();
  };

  $('actMark').onclick = () => { if (state.selected) toggleMark(state.selected); };
  $('actHide').onclick = () => { if (state.selected) toggleHideSelected(state.selected); };
  $('actIsolate').onclick = () => {
    if (!state.selected) return;
    state.isolated === state.selected ? exitIsolate() : enterIsolate(state.selected);
  };
  $('isolateBar').onclick = () => exitIsolate();
  addEventListener('keydown', e => { if (e.key === 'Escape' && state.isolated) exitIsolate(); });

  $('noteSave').onclick = () => {
    if (!state.selected) return;
    const ok = store.setNote(state.selected, $('noteBox').value);
    $('noteSaved').textContent = ok ? '已保存 ✓' : '保存失败';
    setTimeout(() => { $('noteSaved').textContent = ''; }, 2000);
  };

  $('btnShowAll').onclick = () => restoreShow();

  $('btnExport').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brainstem-mydata.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = store.importJSON(reader.result);
        state.keySet = new Set(store.getMarked());
        updateMaterials();
        const rv = { ...state.regionVisible };
        buildRegionUI();
        Object.assign(state.regionVisible, rv);
        applyVisibility();
        if (state.selected) { refreshActionRow(state.selected); $('noteBox').value = store.getNote(state.selected); }
        $('importStat').textContent = `已导入：标记 ${r.marks} 条、笔记 ${r.notes} 条`;
      } catch (err) {
        $('importStat').textContent = '导入失败：' + err.message;
      }
      setTimeout(() => { $('importStat').textContent = ''; }, 4000);
    };
    reader.readAsText(f);
    e.target.value = '';
  };
  $('btnReset').onclick = () => resetView();
  $('btnSpin').onclick = e => {
    state.spin = !state.spin;
    controls.autoRotate = state.spin;
    e.currentTarget.classList.toggle('on', state.spin);
  };
  $('close').onclick = () => clearSelection();
  $('mobileBtn').onclick = () => $('tools').classList.toggle('open');

  const vp = $('vpRange');
  const onSlide = () => applyPanY((+vp.value / 100) * state.panRange);
  vp.addEventListener('input', onSlide);
  vp.addEventListener('dblclick', () => { vp.value = 0; onSlide(); });

  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const el = renderer.domElement;
  let downPos = null;
  el.addEventListener('pointerdown', e => {
    downPos = { x: e.clientX, y: e.clientY };
    if (state.editMode && state.annSprites.length) {
      const near = nearestAnnToScreen(e.clientX, e.clientY);
      if (near) annDrag = { rec: near.rec, moved: false, sx: e.clientX, sy: e.clientY };
    }
  });
  el.addEventListener('pointerup', e => {
    if (annDrag) {
      const d = annDrag; annDrag = null;
      if (d.moved) {
        controls.enabled = true;
        renderer.domElement.style.cursor = '';
        if (state.annSel) {
          const mesh = state.annSel.mesh;
          const sp = annSnap(mesh, state.annSel.entry.pts[state.annSel.ptIndex]);
          state.annSel.entry.pts[state.annSel.ptIndex] = sp;
          state.annSel.sprite.position.set(sp[0], sp[1], sp[2]);
        }
      }
    }
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (moved < 5) pick(e.clientX, e.clientY);
    downPos = null;
  });
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', () => { hoverEl.classList.remove('show'); highlightHover(null); });
  el.addEventListener('dblclick', e => {
    const hitsB = raycast(e.clientX, e.clientY);
    if (!hitsB.length) return;
    const sid = hitsB[0].object.userData.sid;
    if (!sid) return;
    if (state.editMode) {
      if (sid !== state.selected) { selectBone(sid); return; }
      if (state.annSel) moveAnnSelTo(hitsB[0]);
      else createAnnAt(hitsB[0]);
      return;
    }
    selectBone(sid); enterIsolate(sid);
  });

  const opEl = $('annOp');
  if (opEl) {
    opEl.value = Math.round(state.annOp * 100);
    $('annOpVal').textContent = opEl.value + '%';
    opEl.addEventListener('input', () => {
      state.annOp = +opEl.value / 100;
      $('annOpVal').textContent = opEl.value + '%';
      try { localStorage.setItem('bs3d-ann-op', opEl.value); } catch (e) {}
      for (const a of state.annSprites) {
        const emphasized = (state.annSel && state.annSel.entry === a.entry) || a.hover;
        a.sprite.material.opacity = emphasized ? 1.0 : state.annOp;
      }
    });
  }

  const clipBtns = { y: $('clipY'), x: $('clipX'), z: $('clipZ') };
  const clipPos = $('clipPos');
  const setClipUI = () => {
    const c = state.clip;
    for (const [ax, btn] of Object.entries(clipBtns)) btn.classList.toggle('on', c.axis === ax);
    $('clipInv').classList.toggle('on', !!(c.axis && c.invert));
    clipPos.disabled = !c.axis;
  };
  for (const [ax, btn] of Object.entries(clipBtns)) {
    btn.onclick = () => {
      state.clip.axis = state.clip.axis === ax ? null : ax;
      setClipUI(); updateClip();
    };
  }
  $('clipInv').onclick = () => {
    if (!state.clip.axis) return;
    state.clip.invert = !state.clip.invert;
    setClipUI(); updateClip();
  };
  clipPos.addEventListener('input', () => {
    state.clip.pos = +clipPos.value / 100;
    $('clipPosVal').textContent = clipPos.value + '%';
    updateClip();
  });
  $('clipOff').onclick = () => {
    state.clip.axis = null; state.clip.invert = false; state.clip.pos = 0.5;
    clipPos.value = 50; $('clipPosVal').textContent = '50%';
    setClipUI(); updateClip();
  };
}

/* ============ 射线拾取 ============ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let annDrag = null;

function pick(clientX, clientY) {
  const hits = raycast(clientX, clientY);
  const hitSid = hits.length ? hits[0].object.userData.sid : null;
  // 自测「听名找结构」：答题优先于标注点吸附，避免点在已选结构标注附近时吞掉判定
  if (state.quiz.active && state.quiz.mode === 'pick' && !state.quiz.answered) {
    if (!hits.length) { clearSelection(); return; }
    selectBone(hitSid);
    quizAnswerByClick(hitSid);
    return;
  }
  if (state.annSprites.length && hitSid === state.selected) {
    const near = nearestAnnToScreen(clientX, clientY);
    if (near) {
      if (state.editMode) {
        const samePt = state.annSel && state.annSel.entry === near.rec.entry &&
          state.annSel.ptIndex === (near.rec.sprite.userData.ann.ptIndex ?? 0);
        samePt ? clearAnnSel() : selectAnnPoint(near.sprite);
        return;
      }
      const same = state.annSel && state.annSel.entry === near.rec.entry;
      selectAnnPoint(near.sprite);
      showAnnDesc(near.rec.entry);
      if (same) clearAnnSel();
      return;
    }
  }
  if (state.editMode) {
    if (hits.length) {
      if (hitSid !== state.selected) selectBone(hitSid);
      return;
    }
    clearAnnSel();
    return;
  }
  if (!hits.length) { clearSelection(); return; }
  selectBone(hitSid);
}

function raycastList(list, clientX, clientY) {
  ndc.x = (clientX / innerWidth) * 2 - 1;
  ndc.y = -(clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(list, false);
}
function raycast(clientX, clientY) {
  const targets = state.meshes.filter(m => m.mesh.visible).map(m => m.mesh);
  return raycastList(targets, clientX, clientY);
}

function onMove(e) {
  if (annDrag) {
    if (!annDrag.moved && Math.hypot(e.clientX - annDrag.sx, e.clientY - annDrag.sy) > 4) {
      annDrag.moved = true;
      controls.enabled = false;
      selectAnnPoint(annDrag.rec.sprite);
      renderer.domElement.style.cursor = 'grabbing';
    }
    if (annDrag.moved && state.annSel) {
      const hits = raycast(e.clientX, e.clientY).filter(h => h.object.userData.sid === state.selected);
      if (hits.length) moveAnnSelTo(hits[0], true);
    }
    return;
  }
  if (state.annSprites.length && state.selected) {
    const near = nearestAnnToScreen(e.clientX, e.clientY);
    highlightHover(null);
    for (const a of state.annSprites) a.hover = false;
    if (near) {
      near.rec.hover = true;
      renderer.domElement.style.cursor = 'pointer';
      hoverEl.textContent = near.rec.name;
      hoverEl.style.left = (e.clientX + 14) + 'px';
      hoverEl.style.top = (e.clientY + 14) + 'px';
      hoverEl.classList.add('show');
      return;
    }
  }
  const hits = raycast(e.clientX, e.clientY);
  if (!hits.length) {
    hoverEl.classList.remove('show'); highlightHover(null);
    renderer.domElement.style.cursor = 'grab';
    return;
  }
  const sid = hits[0].object.userData.sid;
  const b = state.structs[sid];
  highlightHover(sid);
  renderer.domElement.style.cursor = 'pointer';
  hoverEl.textContent = b ? b.cn : sid;
  hoverEl.style.left = (e.clientX + 14) + 'px';
  hoverEl.style.top = (e.clientY + 14) + 'px';
  hoverEl.classList.add('show');
}

/* ============ 高亮 / 选中 ============ */
function setMeshColor(mesh, color) {
  mesh.material.color.copy(color);
}

const isKey = sid => state.keySet.has(sid);

/* 脑神经的 L/R 互为配对：返回同一概念的另一侧 sid */
function nervePairOf(sid) {
  const m = sid.match(/^(CN-.+)-(L|R)$/);
  return m ? `${m[1]}-${m[2] === 'L' ? 'R' : 'L'}` : null;
}
/* 当前问题（自测）是否指向该 sid */
function isQuizTarget(sid) {
  const q = state.quiz;
  if (!q.active || !q.target) return false;
  if (q.target.sids.includes(sid)) return true;
  const p = nervePairOf(sid);
  return !!p && q.target.sids.includes(p);
}

function baseFor(sid) {
  if (state.quiz.active && state.quiz.answered === false && isQuizTarget(sid) && state.quiz.mode === 'name')
    return QUIZ_COLOR;
  if (state.quiz.active && state.quiz.answered && isQuizTarget(sid)) return QUIZ_COLOR;
  if (state.keyMode && isKey(sid)) return KEY_COLOR;
  if ((state.nerveType[sid] || state.nerveType[nervePairOf(sid) || '']))
    return NERVE_COLORS[state.nerveType[sid] || state.nerveType[nervePairOf(sid)]];
  const region = state.structs[sid]?.region;
  if (region === '参考结构') return REF_COLOR;
  return state.xray ? XRAY_TINT : BASE_COLOR;
}

function refreshEmissive(mesh, sid) {
  if (sid === state.selected) mesh.material.emissive.copy(SEL_EMISSIVE);
  else if (state.quiz.active && isQuizTarget(sid)) mesh.material.emissive.copy(QUIZ_EMISSIVE);
  else if (state.xray) mesh.material.emissive.copy(XRAY_EMISSIVE);
  else mesh.material.emissive.copy(NO_EMISSIVE);
}

function applyXrayToMesh(mesh, sid) {
  const dim = state.xray && sid !== state.selected;
  const needRecompile = mesh.material.transparent !== !!dim;
  mesh.material.transparent = !!dim;
  mesh.material.opacity = dim ? XRAY_OPACITY : 1;
  mesh.material.depthWrite = !dim;
  if (needRecompile) mesh.material.needsUpdate = true;
}

function highlightHover(sid) {
  if (state.hovered && state.hovered !== state.selected) {
    state.bySid.get(state.hovered)?.forEach(m => setMeshColor(m, baseFor(state.hovered)));
  }
  state.hovered = sid;
  if (sid && sid !== state.selected) {
    state.bySid.get(sid)?.forEach(m => setMeshColor(m, HOV_COLOR));
  }
}

function selectBone(sid) {
  clearSelection(false);
  state.selected = sid;
  const b = state.structs[sid];
  if (b) {
    $('tag').textContent = b.region + (b.group && b.group !== '本体' ? ' · ' + b.group : '');
    $('cn').textContent = (isKey(sid) ? '★ ' : '') + b.cn;
    $('latin').textContent = b.latin || '';
    $('enName').textContent = b.en ? b.en.replace(/\b\w/g, c => c.toUpperCase()) : '';
    $('enName').style.display = b.en ? '' : 'none';
    $('desc').textContent = b.desc || '';
    $('fma').textContent = 'ID ' + sid;
    buildAnnSprites(sid);
  } else {
    $('cn').textContent = sid;
    $('latin').textContent = ''; $('enName').textContent = '';
    $('desc').textContent = '(无描述)';
  }
  refreshActionRow(sid);
  $('noteBox').value = store.getNote(sid);
  $('noteSaved').textContent = '';
  updateMaterials();
  infoEl.classList.add('show');
  placeLabel(sid);
}

/* ============ 用户动作 ============ */
function toggleMark(sid) {
  const marked = store.toggleMark(sid);
  state.keySet = new Set(store.getMarked());
  updateMaterials();
  syncListItem(sid);
  if (state.onlyKey) applyVisibility();
  if (state.selected === sid) {
    $('cn').textContent = (marked ? '★ ' : '') + (state.structs[sid]?.cn || sid);
    refreshActionRow(sid);
  }
}

function syncListItem(sid) {
  const el = document.querySelector(`.bone-item[data-sid="${sid}"]`);
  if (!el) return;
  el.classList.toggle('hid', state.hiddenSet.has(sid));
  const star = el.querySelector('.star');
  if (state.keySet.has(sid) && !star) {
    const s = document.createElement('span');
    s.className = 'star'; s.textContent = '★';
    el.prepend(s);
  } else if (!state.keySet.has(sid) && star) {
    star.remove();
  }
}

function refreshActionRow(sid) {
  if (!sid) return;
  const marked = store.isMarked(sid);
  $('actMark').classList.toggle('on', marked);
  $('actMark').querySelector('.act-txt').textContent = marked ? '已标记' : '标记';
  const hidden = state.hiddenSet.has(sid);
  $('actHide').querySelector('.act-txt').textContent = hidden ? '取消隐藏' : '隐藏';
  const iso = state.isolated === sid;
  $('actIsolate').querySelector('.act-txt').textContent = iso ? '退出隔离' : '单独查看';
}

function toggleHideSelected(sid) {
  if (state.hiddenSet.has(sid)) state.hiddenSet.delete(sid);
  else {
    state.hiddenSet.add(sid);
    if (state.isolated === sid) exitIsolate();
  }
  applyVisibility();
  syncListItem(sid);
  refreshActionRow(sid);
}

function restoreShow() {
  state.hiddenSet.clear();
  applyVisibility();
  document.querySelectorAll('.bone-item.hid').forEach(el => el.classList.remove('hid'));
  if (state.selected) refreshActionRow(state.selected);
}

/* 联合包围盒（一个 sid 的全部网格，或一组 sid） */
function boxOfSids(sids) {
  const box = new THREE.Box3();
  for (const sid of sids) {
    for (const m of (state.bySid.get(sid) || [])) {
      m.geometry.computeBoundingBox();
      box.union(new THREE.Box3().copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    }
  }
  return box;
}
function boneBoxOf(sid) { return boxOfSids([sid]); }

function frameBox(box) {
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.02);
  controls.target.copy(c);
  const dir = camera.position.clone().sub(c);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  const fovRad = camera.fov * Math.PI / 180;
  // 自动取景距离下限：微小结构（上丘/下丘等）不再把视角拉到异常近。
  // 下限取默认视距的 22% —— 仍能看清目标，同时保留周边解剖关系。
  const minDist = (state.homeDist || 4) * 0.22;
  const dist = Math.max((r / Math.sin(fovRad / 2)) / 0.62, minDist);
  dir.setLength(dist);
  camera.position.copy(c).add(dir);
  controls.update();
}

function enterIsolate(sid) {
  state.isolated = sid;
  applyVisibility();
  const list = state.bySid.get(sid);
  if (list && list.length) frameBox(boneBoxOf(sid));
  $('isolateBar').textContent = `⤢ 隔离查看：${state.structs[sid]?.cn || sid} —— 点击此处退出`;
  $('isolateBar').classList.add('show');
  if (state.selected === sid) refreshActionRow(sid);
}

function exitIsolate() {
  if (!state.isolated) return;
  state.isolated = null;
  applyVisibility();
  $('isolateBar').classList.remove('show');
  if (state.selected) refreshActionRow(state.selected);
  resetView();
}

function clearSelection(alsoHidePanel = true) {
  state.selected = null;
  clearAnnSel();
  clearAnnSprites();
  updateMaterials();
  if (alsoHidePanel) {
    infoEl.classList.remove('show');
    removeLabel();
  }
}

/* ============ 3D 名称标签（药丸 + 牵引线） ============ */
let labelSprite = null;
let labelLine = null;
let labelAnchor = null;
let labelRadius = 0;

function removeLabel() {
  if (labelSprite) {
    scene.remove(labelSprite);
    labelSprite.material.map?.dispose();
    labelSprite.material.dispose();
    labelSprite.geometry.dispose();
    labelSprite = null;
  }
  if (labelLine) {
    scene.remove(labelLine);
    labelLine.geometry.dispose();
    labelLine.material.dispose();
    labelLine = null;
  }
  labelAnchor = null;
}

const PILL_FS = 18, PILL_PAD_X = 12, PILL_PAD_Y = 6;

function makeLabel(text) {
  const dpr = Math.min(3, Math.max(2, devicePixelRatio || 1));
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = `600 ${PILL_FS}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + PILL_PAD_X * 2;
  const h = PILL_FS + PILL_PAD_Y * 2;
  cv.width = w * dpr; cv.height = h * dpr;
  ctx.scale(dpr, dpr);
  const r = h / 2;
  ctx.fillStyle = 'rgba(61,130,204,0.92)';
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(0.75, 0.75, w - 1.5, h - 1.5, r); ctx.stroke();
  ctx.font = font; ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 999;
  sp.userData.cssW = w;
  sp.userData.cssH = h;
  return sp;
}

const ANN_SNAP_PX = 48;
function nearestAnnToScreen(clientX, clientY, opts = {}) {
  let best = null;
  for (const rec of state.annSprites) {
    if (opts.skipSel && state.annSel && rec.entry === state.annSel.entry && rec.sprite === state.annSel.sprite) continue;
    const wp = rec.sprite.getWorldPosition(new THREE.Vector3());
    if (!opts.ignoreOcclusion && !annSpritePickable(rec.sprite)) continue;
    const p = wp.clone().project(camera);
    if (p.z > 1) continue;
    const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
    const d = Math.hypot(sx - clientX, sy - clientY);
    if (d <= ANN_SNAP_PX && (!best || d < best.d)) best = { rec, d, sprite: rec.sprite };
  }
  return best;
}
function annSpritePickable(sprite) {
  const wp = sprite.getWorldPosition(new THREE.Vector3());
  const dir = wp.clone().sub(camera.position);
  const dist = dir.length();
  if (dist < 1e-6) return true;
  dir.normalize();
  raycaster.set(camera.position, dir);
  raycaster.far = dist - 0.002;
  const hit = raycaster.intersectObjects(state.meshes.filter(m => m.mesh.visible).map(m => m.mesh), false);
  raycaster.far = Infinity;
  return hit.length === 0;
}

/* ============ 结构标注 ============ */
let annTex = null;
function annTexture() {
  if (annTex) return annTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2);
  g.fillStyle = '#ffb14d'; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(45,32,10,.85)'; g.stroke();
  annTex = new THREE.CanvasTexture(c);
  return annTex;
}
function annSnap(mesh, p) {
  const pos = mesh.geometry.attributes.position;
  let best = Infinity, out = p;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p[0], dy = pos.getY(i) - p[1], dz = pos.getZ(i) - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; out = [pos.getX(i), pos.getY(i), pos.getZ(i)]; }
  }
  return out;
}
function clearAnnSprites() {
  clearAnnSel();
  for (const a of state.annSprites) {
    a.sprite.parent.remove(a.sprite);
    a.sprite.material.dispose();
  }
  state.annSprites = [];
}
function clearAnnSel() {
  state.annSel = null;
  const lbl = document.getElementById('annLabel');
  if (lbl) lbl.style.display = 'none';
  for (const a of state.annSprites) {
    a.sprite.material.color.set(0xffffff);
    a.sprite.material.opacity = state.annOp;
  }
  const list = $('annList');
  if (list) {
    const dd = list.querySelector('.ann-desc');
    if (dd) dd.remove();
    list.querySelectorAll('.ann-chip.on').forEach(c => c.classList.remove('on'));
  }
}
function orbitY(angle) {
  const off = camera.position.clone().sub(controls.target);
  off.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  camera.position.copy(controls.target).add(off);
  controls.update();
}
/* rel 侧别后缀：模型 +x 为解剖左，rel[0] ≥ 0.5 即在左半 */
function relSideOf(rel0) { return rel0 >= 0.5 ? '（左）' : '（右）'; }

function annEntriesFor(sid) { return (state.ann && state.ann[sid]) || []; }

function buildAnnSprites(sid) {
  clearAnnSprites();
  if (state.editMode) { buildAnnSpritesEdit(sid); return; }
  const entries = annEntriesFor(sid);
  const meshes = state.bySid.get(sid) || [];
  for (const e of entries) {
    const variants = e.pts
      ? e.pts.map((p, i) => [{ pts: p }, e.pts.length > 1 ? (i === 0 ? '（右）' : '（左）') : ''])
      : (e.side ? [[e.rel, relSideOf(e.rel[0])], [[1 - e.rel[0], e.rel[1], e.rel[2]], relSideOf(1 - e.rel[0])]] : [[e.rel, '']]);
    for (const [rv, suffix] of variants) {
      for (const mesh of meshes) {
        const geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const p = rv.pts ? rv.pts.slice() : [
          bb.min.x + (bb.max.x - bb.min.x) * rv[0],
          bb.min.y + (bb.max.y - bb.min.y) * rv[1],
          bb.min.z + (bb.max.z - bb.min.z) * rv[2],
        ];
        const sp = rv.pts ? rv.pts.slice() : annSnap(mesh, p);
        const mat = new THREE.SpriteMaterial({ map: annTexture(), transparent: true, depthTest: false, depthWrite: false, opacity: state.annOp });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(sp[0], sp[1], sp[2]);
        sprite.renderOrder = 990;
        sprite.userData.ann = { entry: e, name: e.name + suffix };
        mesh.add(sprite);
        state.annSprites.push({ sprite, entry: e, name: sprite.userData.ann.name, mesh });
      }
    }
  }
  renderAnnList(entries);
}
/* ---- 编辑模式 ---- */
function annEditFor(sid) {
  if (!state.annEdit) state.annEdit = {};
  if (state.annEdit[sid]) return state.annEdit[sid];
  const srcEntries = annEntriesFor(sid);
  const out = [];
  let n = 0;
  for (const e of srcEntries) {
    const variants = e.pts
      ? e.pts.map((p, i) => [{ pts: p }, e.pts.length > 1 ? (i === 0 ? '（右）' : '（左）') : ''])
      : (e.side ? [[e.rel, relSideOf(e.rel[0])], [[1 - e.rel[0], e.rel[1], e.rel[2]], relSideOf(1 - e.rel[0])]] : [[e.rel, '']]);
    const meshes = state.bySid.get(sid) || [];
    for (const [rv, suffix] of variants) {
      for (const mesh of meshes) {
        const geo = mesh.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const p = rv.pts ? rv.pts.slice() : [
          bb.min.x + (bb.max.x - bb.min.x) * rv[0],
          bb.min.y + (bb.max.y - bb.min.y) * rv[1],
          bb.min.z + (bb.max.z - bb.min.z) * rv[2],
        ];
        const sp = rv.pts ? rv.pts.slice() : annSnap(mesh, p);
        out.push({ id: e.id + '-' + (n++), name: e.name + suffix, en: e.en || '', desc: e.desc || '', detail: e.detail || '', pts: [sp] });
        break;
      }
    }
  }
  state.annEdit[sid] = out;
  return out;
}
function buildAnnSpritesEdit(sid) {
  const entries = annEditFor(sid);
  const meshes = state.bySid.get(sid) || [];
  for (const e of entries) {
    for (let pi = 0; pi < e.pts.length; pi++) {
      for (const mesh of meshes) {
        const mat = new THREE.SpriteMaterial({ map: annTexture(), transparent: true, depthTest: false, depthWrite: false, opacity: state.annOp });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(e.pts[pi][0], e.pts[pi][1], e.pts[pi][2]);
        sprite.renderOrder = 990;
        const suffix = e.pts.length > 1 ? ' ' + (pi + 1) : '';
        sprite.userData.ann = { entry: e, name: e.name + suffix, ptIndex: pi };
        mesh.add(sprite);
        state.annSprites.push({ sprite, entry: e, name: sprite.userData.ann.name, mesh, sid });
      }
    }
  }
  renderAnnList(entries);
  refreshAnnEditForm();
}
function selectAnnPoint(sprite) {
  const rec = sprite ? state.annSprites.find(r => r.hit === sprite || r.sprite === sprite) : null;
  for (const a of state.annSprites) { a.sprite.material.color.set(0xffffff); a.sprite.material.opacity = state.annOp; }
  state.annSel = rec ? { sid: state.selected, entry: rec.entry, ptIndex: rec.sprite.userData.ann.ptIndex ?? 0, sprite: rec.sprite, mesh: rec.mesh } : null;
  if (state.annSel) {
    state.annSel.sprite.material.color.set(0xff4a2e);
    state.annSel.sprite.material.opacity = 1.0;
  }
  const lbl = document.getElementById('annLabel');
  if (lbl) {
    if (state.annSel) {
      lbl.textContent = state.annSel.entry.name;
      lbl.style.display = 'block';
    } else {
      lbl.style.display = 'none';
    }
  }
  const list = $('annList');
  if (list) {
    list.querySelectorAll('.ann-chip').forEach(c => c.classList.remove('on'));
    if (state.annSel) {
      list.querySelectorAll('.ann-chip').forEach(c => { if (c.textContent === rec.entry.name) c.classList.add('on'); });
    }
  }
  refreshAnnEditForm();
}
function moveAnnSelTo(hit, live = false) {
  if (!state.annSel) return;
  const mesh = hit.object;
  const local = mesh.worldToLocal(hit.point.clone());
  const p = [local.x, local.y, local.z];
  const sp = live ? p : annSnap(mesh, p);
  state.annSel.entry.pts[state.annSel.ptIndex] = sp;
  if (state.annSel.sprite.parent !== mesh) {
    state.annSel.sprite.parent.remove(state.annSel.sprite);
    mesh.add(state.annSel.sprite);
    state.annSel.mesh = mesh;
  }
  state.annSel.sprite.position.set(sp[0], sp[1], sp[2]);
}
function createAnnAt(hit) {
  const sid = hit.object.userData.sid;
  if (!sid) return;
  const entries = annEditFor(sid);
  const mesh = hit.object;
  const local = mesh.worldToLocal(hit.point.clone());
  const sp = annSnap(mesh, [local.x, local.y, local.z]);
  const entry = { id: 'ann-' + Date.now(), name: '新标注', en: '', desc: '', detail: '', pts: [sp] };
  entries.push(entry);
  buildAnnSprites(state.selected);
  const rec = state.annSprites.find(x => x.entry === entry);
  selectAnnPoint(rec ? rec.sprite : null);
}
function deleteAnnSel() {
  if (!state.annSel) return;
  const { sid, entry, ptIndex } = state.annSel;
  entry.pts.splice(ptIndex, 1);
  if (!entry.pts.length) {
    const arr = (state.annEdit[sid] || []).filter(e => e !== entry);
    state.annEdit[sid] = arr;
  }
  state.annSel = null;
  buildAnnSprites(state.selected);
  refreshAnnEditForm();
}
function refreshAnnEditForm() {
  const sec = document.getElementById('annEditSec');
  if (!sec) return;
  if (!state.editMode || !state.annSel) { sec.hidden = true; return; }
  sec.hidden = false;
  const { entry } = state.annSel;
  const nm = document.getElementById('annName'), en = document.getElementById('annEn'),
        de = document.getElementById('annDesc'), dt = document.getElementById('annDetail');
  if (document.activeElement !== nm) nm.value = entry.name;
  if (document.activeElement !== en) en.value = entry.en || '';
  if (document.activeElement !== de) de.value = entry.desc || '';
  if (document.activeElement !== dt) dt.value = entry.detail || '';
}
function exportAnnotations() {
  if (!state.annEdit) { loadTip('没有修改可导出'); return; }
  const merged = {};
  for (const [sid, entries] of Object.entries(state.ann)) merged[sid] = entries;
  for (const [sid, entries] of Object.entries(state.annEdit)) merged[sid] = entries;
  const blob = new Blob([JSON.stringify(merged, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const fname = prompt('导出文件名（不含扩展名），可带版号：', 'annotations-v2');
  if (!fname) return;
  a.download = fname.trim() + '.json';
  a.click();
}

function renderAnnList(entries) {
  const sec = $('annSec'), list = $('annList');
  if (!sec) return;
  if (!entries.length) { sec.hidden = true; list.innerHTML = ''; return; }
  sec.hidden = false;
  list.innerHTML = '';
  for (const e of entries) {
    const chip = document.createElement('span');
    chip.className = 'ann-chip';
    chip.textContent = e.name;
    chip.onclick = () => {
      showAnnDesc(e);
      if (state.editMode) {
        const rec = state.annSprites.find(a => a.entry === e);
        if (rec) selectAnnPoint(rec.sprite);
      }
    };
    list.appendChild(chip);
  }
}
function showAnnDesc(entry) {
  const list = $('annList');
  if (!list) return;
  const old = list.querySelector('.ann-desc');
  const isOpen = old && old.dataset.id === entry.id;
  if (old) old.remove();
  list.querySelectorAll('.ann-chip').forEach(c => c.classList.remove('on'));
  if (isOpen) {
    for (const a of state.annSprites) { a.sprite.material.color.set(0xffffff); a.sprite.material.opacity = state.annOp; }
    return;
  }
  const dd = document.createElement('div');
  dd.className = 'ann-desc';
  dd.dataset.id = entry.id;
  dd.textContent = entry.desc;
  if (entry.detail) {
    const dt = document.createElement('div');
    dt.className = 'ann-detail';
    dt.textContent = entry.detail;
    dd.appendChild(dt);
  }
  list.appendChild(dd);
  list.querySelectorAll('.ann-chip').forEach(c => { if (c.textContent === entry.name) c.classList.add('on'); });
  for (const a of state.annSprites) {
    a.sprite.material.color.set(a.entry === entry ? 0xff4a2e : 0xffffff);
    a.sprite.material.opacity = a.entry === entry ? 1.0 : 0.5;
  }
}

function placeLabel(sid) {
  removeLabel();
  if (!state.showLabel) return;
  const list = state.bySid.get(sid);
  if (!list || !list.length) return;
  const b = state.structs[sid];
  if (!b) return;
  const box = boneBoxOf(sid);
  labelAnchor = box.getCenter(new THREE.Vector3());
  labelRadius = box.getBoundingSphere(new THREE.Sphere()).radius || 0.01;
  labelSprite = makeLabel(b.cn);
  scene.add(labelSprite);
  const geo = new THREE.BufferGeometry().setFromPoints([labelAnchor.clone(), labelAnchor.clone()]);
  labelLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0x4da3ff, transparent: true, opacity: 0.85, depthTest: false,
  }));
  labelLine.renderOrder = 998;
  scene.add(labelLine);
  updateLabelPose();
}

function updateLabelPose() {
  if (!labelSprite || !labelAnchor) return;
  const anchorCam = labelAnchor.clone().applyMatrix4(camera.matrixWorldInverse);
  if (anchorCam.z >= -0.01) {
    labelSprite.visible = false;
    labelLine.visible = false;
    return;
  }
  labelSprite.visible = true;
  labelLine.visible = true;

  const dist = -anchorCam.z;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
  const halfW = halfH * camera.aspect;
  const pxPerWorld = innerHeight / (2 * halfH);
  const pw = labelSprite.userData.cssW;
  const ph = labelSprite.userData.cssH;

  const ndc = labelAnchor.clone().project(camera);
  const ax = (ndc.x * 0.5 + 0.5) * innerWidth;
  const ay = (-ndc.y * 0.5 + 0.5) * innerHeight;
  const boneRpx = Math.max(labelRadius * pxPerWorld, 6);

  const clampX = v => Math.min(innerWidth - pw / 2 - 8, Math.max(pw / 2 + 8, v));
  const clampY = v => Math.min(innerHeight - ph / 2 - 8, Math.max(ph / 2 + 8, v));
  const staggerY = () => {
    const down = ay + boneRpx + ph / 2 + 10;
    const up = ay - boneRpx - ph / 2 - 10;
    sy = (down <= innerHeight - ph / 2 - 8) ? down
      : (up >= ph / 2 + 8) ? up
      : clampY(down);
  };

  let side = ax >= innerWidth / 2 ? 1 : -1;
  let sx = clampX(ax + side * (boneRpx + pw / 2 + 12));
  let sy = clampY(ay);
  if (Math.abs(sx - ax) < boneRpx + pw / 2 && Math.abs(sy - ay) < boneRpx + ph / 2) staggerY();

  const infoEl = document.getElementById('info');
  if (infoEl && infoEl.classList.contains('show')) {
    const r = infoEl.getBoundingClientRect();
    const hitP = () => Math.abs(sx - (r.left + r.width / 2)) < pw / 2 + r.width / 2 + 6 &&
                       Math.abs(sy - (r.top + r.height / 2)) < ph / 2 + r.height / 2 + 6;
    if (hitP() && side === 1) {
      side = -1;
      sx = clampX(ax + side * (boneRpx + pw / 2 + 12));
      if (Math.abs(sx - ax) < boneRpx + pw / 2 && Math.abs(sy - ay) < boneRpx + ph / 2) staggerY();
    }
    if (hitP()) {
      const above = r.top - ph / 2 - 8;
      const below = r.bottom + ph / 2 + 8;
      sy = Math.abs(sy - above) <= Math.abs(below - sy)
        ? clampY(above) : clampY(below);
    }
  }

  const labelPos = new THREE.Vector3(
    (sx / innerWidth * 2 - 1) * halfW,
    (1 - 2 * sy / innerHeight) * halfH,
    anchorCam.z
  ).applyMatrix4(camera.matrixWorld);
  labelSprite.position.copy(labelPos);
  labelSprite.scale.set(pw / pxPerWorld, ph / pxPerWorld, 1);

  const ex = sx - side * pw / 2;
  const lineEnd = new THREE.Vector3(
    (ex / innerWidth * 2 - 1) * halfW,
    (1 - 2 * sy / innerHeight) * halfH,
    anchorCam.z
  ).applyMatrix4(camera.matrixWorld);
  const posAttr = labelLine.geometry.attributes.position;
  posAttr.setXYZ(0, labelAnchor.x, labelAnchor.y, labelAnchor.z);
  posAttr.setXYZ(1, lineEnd.x, lineEnd.y, lineEnd.z);
  posAttr.needsUpdate = true;
}

function updateMaterials() {
  state.meshes.forEach(({ mesh, sid }) => {
    applyXrayToMesh(mesh, sid);
    if (sid === state.selected) setMeshColor(mesh, SEL_COLOR);
    else setMeshColor(mesh, sid === state.hovered ? HOV_COLOR : baseFor(sid));
    refreshEmissive(mesh, sid);
  });
}

/* ============ 垂直平移 / 重置 ============ */
function applyPanY(v) {
  const delta = v - state.panY;
  if (!delta) return;
  camera.position.y += delta;
  controls.target.y += delta;
  state.panY = v;
  controls.update();
}

function resetView() {
  if (!state.homeDist) return;
  const vp = $('vpRange');
  if (vp) vp.value = 0;
  applyPanY(0);
  controls.target.set(0, 0, 0);
  const dir = camera.position.clone().sub(controls.target);
  dir.y = Math.max(dir.y, 0.1);
  dir.setLength(state.homeDist);
  camera.position.copy(dir);
  controls.update();
}

/* ============ 剖面剖切 ============ */
const CLIP_NORMALS = {
  y: new THREE.Vector3(0, -1, 0),
  x: new THREE.Vector3(-1, 0, 0),
  z: new THREE.Vector3(0, 0, -1),
};
let clipHelper = null;

function clipPlane() {
  const c = state.clip;
  if (!c.axis || !state.modelBox) return null;
  const n = CLIP_NORMALS[c.axis].clone();
  if (c.invert) n.negate();
  const min = state.modelBox.min[c.axis], max = state.modelBox.max[c.axis];
  const p = min + (max - min) * c.pos;
  const ref = new THREE.Vector3();
  ref[c.axis] = p;
  return new THREE.Plane(n, -n.dot(ref));
}

function updateClip() {
  const plane = clipPlane();
  state.meshes.forEach(({ mesh }) => {
    const had = !!(mesh.material.clippingPlanes && mesh.material.clippingPlanes.length);
    const needRecompile = had !== !!plane;
    mesh.material.clippingPlanes = plane ? [plane] : null;
    mesh.material.side = plane ? THREE.DoubleSide : THREE.FrontSide;
    if (needRecompile) mesh.material.needsUpdate = true;
  });
  renderer.localClippingEnabled = !!plane;
  updateClipHelper();
}

function updateClipHelper() {
  if (clipHelper) {
    scene.remove(clipHelper);
    clipHelper.geometry.dispose();
    clipHelper.material.dispose();
    clipHelper = null;
  }
  const c = state.clip;
  if (!c.axis || !state.modelBox) return;
  const size = state.modelBox.getSize(new THREE.Vector3());
  const dims = { x: [size.z, size.y], y: [size.x, size.z], z: [size.x, size.y] }[c.axis];
  clipHelper = new THREE.Mesh(
    new THREE.PlaneGeometry(dims[0] * 1.08, dims[1] * 1.08),
    new THREE.MeshBasicMaterial({
      color: 0x4da3ff, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  const min = state.modelBox.min[c.axis], max = state.modelBox.max[c.axis];
  const p = min + (max - min) * c.pos;
  if (c.axis === 'y') { clipHelper.rotation.x = -Math.PI / 2; clipHelper.position.y = p; }
  else if (c.axis === 'x') { clipHelper.rotation.y = Math.PI / 2; clipHelper.position.x = p; }
  else { clipHelper.position.z = p; }
  clipHelper.renderOrder = 5;
  scene.add(clipHelper);
}

/* ============ 底部学习面板（dock） ============ */
function bindDock() {
  const dock = $('dock');
  const tabs = document.querySelectorAll('.dock-tab');
  const showPage = name => {
    tabs.forEach(t => t.classList.toggle('on', t.dataset.page === name));
    document.querySelectorAll('.dock-page').forEach(p => p.classList.toggle('on', p.id === 'page-' + name));
  };
  tabs.forEach(t => t.onclick = () => showPage(t.dataset.page));
  $('dockClose').onclick = () => {
    state.dockOpen = false;
    dock.classList.remove('show');
    $('btnNerve').classList.remove('on');
    $('btnSummary').classList.remove('on');
    $('btnQuiz').classList.remove('on');
    if (state.quiz.active) stopQuiz();
  };
  const openTo = name => {
    state.dockOpen = true;
    dock.classList.add('show');
    showPage(name);
  };
  $('btnNerve').onclick = e => {
    const on = !state.dockOpen || !document.getElementById('page-nerve').classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    on ? openTo('nerve') : $('dockClose').onclick();
  };
  $('btnSummary').onclick = e => {
    const on = !state.dockOpen || !document.getElementById('page-summary').classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    on ? openTo('summary') : $('dockClose').onclick();
  };
  $('btnQuiz').onclick = e => {
    const on = !state.dockOpen || !document.getElementById('page-quiz').classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    on ? openTo('quiz') : $('dockClose').onclick();
  };
  $('btnSumMd').onclick = exportSummaryMd;
}

/* ---- 脑神经表 ---- */
function nerveKind(n) {
  const t = n.type || '';
  return t.includes('混合') ? 'mixed' : (t.includes('感觉') ? 'sensory' : 'motor');
}
function buildNerveTable() {
  const wrap = $('nerveRows');
  wrap.innerHTML = '';
  const order = ['CN-I', 'CN-II', 'CN-III', 'CN-IV', 'CN-V', 'CN-VI', 'CN-VII', 'CN-VIII', 'CN-IX', 'CN-X', 'CN-XI', 'CN-XII'];
  for (const cid of order) {
    const n = state.nerves[cid];
    if (!n) continue;
    const row = document.createElement('div');
    row.className = 'nrow';
    row.dataset.cid = cid;
    row.innerHTML = `<span class="num">${n.numeral}</span>` +
      `<span class="nm">${n.cn}</span>` +
      `<span class="tp ${nerveKind(n)}">${n.type.replace(/（.*?）/g, '')}</span>` +
      `<span class="ex">${n.exit}</span>`;
    row.onclick = () => selectNerve(cid);
    wrap.appendChild(row);
  }
}
function selectNerve(cid) {
  const n = state.nerves[cid];
  if (!n) return;
  document.querySelectorAll('.nrow').forEach(r => r.classList.toggle('on', r.dataset.cid === cid));
  // 3D 高亮左右两侧（I 无对应结构则只出详情），视角对准两根神经
  const sids = (n.sids || [`CN-${n.numeral}-L`, `CN-${n.numeral}-R`]).filter(s => state.bySid.has(s));
  if (sids.length) {
    clearSelection(false);
    state.selected = sids[0];
    // 高亮两侧：选中色 + 邻侧用 hover 色近似同色调
    sids.forEach(s => {
      state.bySid.get(s)?.forEach(m => { setMeshColor(m, SEL_COLOR); refreshEmissive(m, s); });
    });
    infoEl.classList.add('show');
    const b = state.structs[sids[0]];
    if (b) {
      $('tag').textContent = '脑神经 · ' + n.type;
      $('cn').textContent = n.cn + '（' + n.numeral + '）';
      $('latin').textContent = '';
      $('enName').textContent = n.en || '';
      $('desc').textContent = n.func || '';
      $('fma').textContent = 'ID ' + sids.join(' / ');
      buildAnnSprites(sids[0]);
    }
    removeLabel();
    // 神经取景：固定前外上方向，保证两根神经与脑干相对位置一目了然
    {
      const box = boxOfSids(sids);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05);
        const fovRad = camera.fov * Math.PI / 180;
        // 与 frameBox 相同的距离下限，避免细小神经取景过近
        const dist = Math.max((r / Math.sin(fovRad / 2)) / 0.72, (state.homeDist || 4) * 0.22);
        const dir = new THREE.Vector3(0.45, 0.3, 1).normalize();
        camera.position.copy(c).add(dir.multiplyScalar(dist));
        controls.target.copy(c);
        controls.update();
      }
    }
  }
  const det = $('nerveDetail');
  det.classList.add('show');
  det.innerHTML = `<h4>${n.cn}（CN ${n.numeral}）· ${n.en}</h4>` +
    `<b>纤维性质：</b>${n.type}<br>` +
    `<b>脑干核团：</b>${n.nuclei}<br>` +
    `<b>出入脑部位：</b>${n.exit}<br>` +
    `<b>功能：</b>${n.func}<br>` +
    `<b>损伤表现：</b>${n.lesion}` +
    (sids.length ? '' : '<br><span style="color:var(--dim)">※ 该神经的对应结构未包含在本 3D 模型中。</span>');
}

/* ---- 任务二总结矩阵 ---- */
function buildSummary() {
  fetchJSON('./data/summary.json?v=20261030a', null).then(sum => {
    if (!sum) return;
    state.summary = sum;
    const cols = $('sumCols');
    cols.innerHTML = '';
    for (const key of ['延髓', '脑桥', '中脑']) {
      const part = sum[key];
      if (!part) continue;
      const col = document.createElement('div');
      col.className = 'sum-col';
      col.innerHTML = `<h3>${key}</h3><div class="lat">${part.en || ''}</div>`;
      for (const secName of ['外部结构', '内部核团', '纤维束', '脑神经', '核心功能']) {
        const items = part[secName] || [];
        if (!items.length) continue;
        const sec = document.createElement('div');
        sec.className = 'sum-sec';
        const h = document.createElement('h4');
        h.innerHTML = `<span class="arr">▾</span>${secName}<span style="margin-left:auto;color:var(--dim);font-weight:400">${items.length}</span>`;
        h.onclick = () => sec.classList.toggle('folded');
        const box = document.createElement('div');
        box.className = 'sum-items';
        for (const it of items) {
          const d = document.createElement('div');
          d.className = 'sum-item' + (it.s ? ' link' : '');
          d.innerHTML = it.t + (it.n ? ` <span class="nn">—— ${it.n}</span>` : '');
          if (it.s) {
            d.title = '点击在 3D 中定位';
            d.onclick = () => {
              const sid = state.bySid.has(it.s) ? it.s : (it.s + '-L');
              if (state.bySid.has(sid)) { selectBone(sid); frameBox(boneBoxOf(sid)); }
            };
          }
          box.appendChild(d);
        }
        sec.appendChild(h);
        sec.appendChild(box);
        col.appendChild(sec);
      }
      cols.appendChild(col);
    }
  });
}
function exportSummaryMd() {
  const sum = state.summary;
  if (!sum) { loadTip('总结数据尚未加载'); return; }
  const lines = ['# 脑干三部分总结（任务二）', '',
    '> 来源：brainstem-3d 交互模型 · 内容待人工复核', ''];
  for (const key of ['延髓', '脑桥', '中脑']) {
    const part = sum[key];
    if (!part) continue;
    lines.push(`## ${key}（${part.en || ''}）`, '');
    for (const secName of ['外部结构', '内部核团', '纤维束', '脑神经', '核心功能']) {
      const items = part[secName] || [];
      if (!items.length) continue;
      lines.push(`### ${secName}`, '');
      for (const it of items) lines.push(`- **${it.t}**${it.n ? '：' + it.n : ''}`);
      lines.push('');
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '脑干三部分总结.md';
  a.click();
  URL.revokeObjectURL(a.href);
  loadTip('已导出 脑干三部分总结.md');
}

/* ---- 任务一 · 结构辨识（1-17 编号图） ---- */
async function buildTask1() {
  const d = await fetchJSON('./data/task1.json?v=20261104a', null);
  if (!d) return;
  state.task1 = d;
  const pins = $('t1Pins'), table = $('t1Table');
  pins.innerHTML = ''; table.innerHTML = '';
  for (const it of d.items) {
    const pin = document.createElement('div');
    pin.className = 't1-pin';
    pin.textContent = it.n;
    pin.style.left = it.pos[0] + '%';
    pin.style.top = it.pos[1] + '%';
    pin.title = '点击揭晓';
    pin.onclick = () => toggleT1(it.n);
    pins.appendChild(pin);
    const row = document.createElement('div');
    row.className = 't1-row hideAns';
    row.dataset.n = it.n;
    row.innerHTML = `<span class="no">${it.n}</span><span class="ans">${it.ans}</span>` +
      (it.sure ? '' : '<span class="flag">⚠ 待复核</span>');
    row.onclick = () => toggleT1(it.n);
    table.appendChild(row);
  }
}
function toggleT1(n, force) {
  const d = state.task1;
  if (!d || !d.items.some(x => x.n === n)) return;
  const show = force !== undefined ? force : !state.t1Revealed.has(n);
  if (show) state.t1Revealed.add(n); else state.t1Revealed.delete(n);
  document.querySelectorAll('#t1Pins .t1-pin').forEach(p => {
    if (+p.textContent === n) p.classList.toggle('on', show);
  });
  const row = document.querySelector(`#t1Table .t1-row[data-n="${n}"]`);
  if (row) { row.classList.toggle('hideAns', !show); row.classList.toggle('on', show); }
}
function bindTask1() {
  $('btnT1Reveal').onclick = () => { state.task1?.items.forEach(it => toggleT1(it.n, true)); };
  $('btnT1Reset').onclick = () => { state.task1?.items.forEach(it => toggleT1(it.n, false)); };
  $('btnT1Md').onclick = () => {
    const d = state.task1;
    if (!d) { loadTip('任务一数据尚未加载'); return; }
    const lines = ['# 任务一 · 结构辨识答案（1-17）', '',
      '> ⚠ = AI 初判，需对照老师讲评复核（data/task1.json）', ''];
    for (const it of d.items) {
      lines.push(`${it.n}. ${it.ans}${it.sure ? '' : ' ⚠'}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '任务一结构辨识答案.md';
    a.click();
    URL.revokeObjectURL(a.href);
    loadTip('已导出 任务一结构辨识答案.md');
  };
}

/* ---- 自测模式 ---- */
function quizPool() {
  // 概念级（合并 L/R）：三部分+脑神经。参考结构不入池；
  // 第四脑室等腔隙藏在模型内部，外部点选无法命中，同样不入池
  const map = new Map();
  for (const [sid, b] of Object.entries(state.structs)) {
    if (b.region === '参考结构' || b.region === '脑室系统') continue;
    const cid = sid.replace(/-(L|R)$/, '');
    if (!map.has(cid)) map.set(cid, { cid, cn: b.cn.replace(/（[左右]）/g, ''), sids: [], region: b.region });
    map.get(cid).sids.push(sid);
  }
  return [...map.values()];
}

function bindQuiz() {
  document.querySelectorAll('.qmode-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.qmode-btn').forEach(x => x.classList.toggle('on', x === b));
      state.quiz.mode = b.dataset.qm;
      if (state.quiz.active) nextQuiz();
    };
  });
  $('quizStart').onclick = () => startQuiz();
  $('quizNext').onclick = () => nextQuiz();
}

function startQuiz() {
  state.quiz.active = true;
  state.quiz.right = 0;
  state.quiz.total = 0;
  $('quizScore').innerHTML = '得分 <b>0</b> / <span>0</span>';
  $('quizStart').style.display = 'none';
  $('quizFoot').hidden = false;
  updateMaterials();
  nextQuiz();
}
function stopQuiz() {
  state.quiz.active = false;
  state.quiz.target = null;
  $('quizStart').style.display = '';
  $('quizFoot').hidden = true;
  $('quizQ').textContent = '通过随机抽问巩固脑干结构。题目覆盖：三部分本体、外部标志、脑神经与脑室系统。';
  $('quizOpts').innerHTML = '';
  updateMaterials();
}
function pickTarget() {
  const pool = quizPool();
  return pool[Math.floor(Math.random() * pool.length)];
}
function nextQuiz() {
  const q = state.quiz;
  q.answered = false;
  q.target = pickTarget();
  updateMaterials();
  const opts = buildOptions(q.target);
  if (q.mode === 'name') {
    // 3D 高亮目标（黄色），猜名称
    frameBox(boxOfSids(q.target.sids));
    $('quizQ').innerHTML = '高亮（黄色）的结构是？';
    renderOptions(opts, o => o.cid === q.target.cid);
  } else {
    $('quizQ').innerHTML = '请在模型中点击：<span class="hl">' + q.target.cn + '</span>';
    $('quizOpts').innerHTML = '<div style="grid-column:1/-1;font-size:12.5px;color:var(--dim)">直接在 3D 模型上点击对应结构（左右任一侧均可）</div>';
  }
}
function buildOptions(target) {
  const pool = quizPool();
  const others = pool.filter(p => p.cid !== target.cid)
    .sort(() => Math.random() - 0.5).slice(0, 3);
  return [target, ...others].sort(() => Math.random() - 0.5);
}
function renderOptions(opts, isRight) {
  const box = $('quizOpts');
  box.innerHTML = '';
  for (const o of opts) {
    const d = document.createElement('div');
    d.className = 'qopt';
    d.textContent = o.cn;
    d.onclick = () => {
      if (state.quiz.answered) return;
      state.quiz.answered = true;
      state.quiz.total++;
      const ok = isRight(o);
      if (ok) state.quiz.right++;
      d.classList.add(ok ? 'right' : 'wrong');
      if (!ok) {
        box.querySelectorAll('.qopt').forEach(x => {
          if (x.textContent === state.quiz.target.cn) x.classList.add('right');
        });
      }
      $('quizScore').innerHTML = `得分 <b>${state.quiz.right}</b> / <span>${state.quiz.total}</span>`;
      updateMaterials();
    };
    box.appendChild(d);
  }
}
function quizAnswerByClick(sid) {
  const q = state.quiz;
  const target = q.target;
  const hit = target.sids.includes(sid) || target.sids.includes(nervePairOf(sid) || '');
  q.answered = true;
  q.total++;
  if (hit) q.right++;
  $('quizScore').innerHTML = `得分 <b>${q.right}</b> / <span>${q.total}</span>`;
  $('quizOpts').innerHTML = hit
    ? '<div style="grid-column:1/-1;color:#b8ecc6">✓ 答对了！</div>'
    : `<div style="grid-column:1/-1;color:#ffb3a8">✗ 你点的是「${state.structs[sid]?.cn || sid}」，正确答案已用黄色高亮。</div>`;
  updateMaterials();
}

/* ============ 轻提示 ============ */
function loadTip(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:60;' +
    'background:rgba(18,22,32,.95);border:1px solid rgba(120,140,180,.22);color:#ffd9a8;' +
    'font-size:12px;padding:7px 14px;border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,.4);' +
    'max-width:min(80vw,520px);text-align:center';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/* ============ 渲染循环 ============ */
let frameCount = 0;
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateLabelPose();
  const annLbl = document.getElementById('annLabel');
  if (annLbl && state.annSel && state.annSel.sprite) {
    const v = state.annSel.sprite.getWorldPosition(new THREE.Vector3());
    const p = v.project(camera);
    if (p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1) {
      annLbl.style.display = 'block';
      annLbl.style.left = ((p.x + 1) / 2 * innerWidth + 18) + 'px';
      annLbl.style.top = ((1 - p.y) / 2 * innerHeight - 18) + 'px';
    } else {
      annLbl.style.display = 'none';
    }
  } else if (annLbl) {
    annLbl.style.display = 'none';
  }
  const tmpV = new THREE.Vector3();
  const occFrame = (frameCount++ % 6 === 0);
  for (const a of state.annSprites) {
    a.sprite.getWorldPosition(tmpV);
    const s = camera.position.distanceTo(tmpV) * 0.0113;
    a.sprite.scale.set(s, s, 1);
    if (occFrame) {
      const dir = tmpV.clone().sub(camera.position);
      const dist = dir.length();
      dir.normalize();
      raycaster.set(camera.position, dir);
      raycaster.far = dist - 0.002;
      const hit = raycaster.intersectObject(a.mesh, false);
      raycaster.far = Infinity;
      const emphasized = (state.annSel && state.annSel.entry === a.entry) || a.hover;
      a.sprite.material.opacity = emphasized ? 1.0 : (hit.length ? state.annOp * 0.32 : state.annOp);
    }
  }
  renderer.render(scene, camera);
}

boot();

/* 编辑模式表单绑定 */
(function annFormBind() {
  const map = { annName: 'name', annEn: 'en', annDesc: 'desc', annDetail: 'detail' };
  for (const [id, field] of Object.entries(map)) {
    document.getElementById(id).addEventListener('input', e => {
      if (!state.annSel) return;
      state.annSel.entry[field] = e.target.value;
      if (field === 'name') {
        for (const a of state.annSprites) if (a.entry === state.annSel.entry) a.name = e.target.value;
        const lbl = document.getElementById('annLabel');
        if (lbl && state.annSel) lbl.textContent = e.target.value;
        renderAnnList(state.annEdit[state.annSel.sid] || []);
      }
    });
  }
  document.getElementById('annDel').onclick = deleteAnnSel;
})();

/* 键盘方向键 */
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  if (state.editMode && state.annSel && e.key === 'Delete') {
    e.preventDefault();
    deleteAnnSel();
    return;
  }
  const step = (state.panRange || 1) * 0.05;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    applyPanY(state.panY + (e.key === 'ArrowUp' ? step : -step));
    const vp = $('vpRange');
    if (vp) vp.value = (state.panY / state.panRange) * 100;
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    orbitY(e.key === 'ArrowLeft' ? 0.12 : -0.12);
  }
});

/* 调试出口 */
window.__bs = { state, camera, scene, controls, THREE };
