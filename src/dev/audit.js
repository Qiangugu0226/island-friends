import * as THREE from 'three';

// 自动穿模审计：扫一遍场景里的固定物件，列出所有可疑的摆放问题
// 检查项：浮空 / 埋进地形 / 压在道路或池塘上 / 物件之间互相重叠
export function createAudit({ structures, layout, cfg }) {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();

  function itemsFromGroup() {
    const items = [];
    for (const child of structures.group.children) {
      if (!child.visible) continue;
      if (child.isInstancedMesh) continue; // 石板路单独处理
      box.setFromObject(child);
      if (box.isEmpty()) continue;
      box.getSize(size);
      const r = Math.max(size.x, size.z) / 2;
      if (r < 0.2) continue;
      const meta = child.userData.audit ?? {};
      const kind = meta.kind ?? 'prop';
      items.push({
        name: child.name || child.type,
        kind,
        tag: meta.tag,
        cx: (box.min.x + box.max.x) / 2,
        cz: (box.min.z + box.max.z) / 2,
        // 树用树干半径参与重叠判断（树冠很高，底下的道具是合理的）
        r: kind === 'tree' ? Math.min(r, 0.9) : r,
        minY: box.min.y,
        maxY: kind === 'tree' ? box.min.y + 2.5 : box.max.y,
        height: size.y,
        obj: child
      });
    }
    return items;
  }

  function terrainSpanUnder(item) {
    let lo = Infinity;
    let hi = -Infinity;
    const samples = [
      [0, 0],
      [item.r, 0],
      [-item.r, 0],
      [0, item.r],
      [0, -item.r],
      [item.r * 0.7, item.r * 0.7],
      [-item.r * 0.7, -item.r * 0.7]
    ];
    for (const [dx, dz] of samples) {
      const h = layout.heightAt(item.cx + dx, item.cz + dz);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    return { lo, hi };
  }

  function roadDistance(x, z) {
    let best = Infinity;
    for (const path of layout.paths) {
      for (const s of path.segs) {
        let t = 0;
        if (s.len2 > 1e-6) t = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len2));
        const px = s.a.x + s.dx * t;
        const pz = s.a.z + s.dz * t;
        best = Math.min(best, Math.hypot(x - px, z - pz) - path.half);
      }
    }
    return best;
  }

  function pondClearance(x, z) {
    let best = Infinity;
    for (const p of layout.ponds) best = Math.min(best, Math.hypot(x - p.x, z - p.z) - p.r);
    return best;
  }

  return function audit() {
    const items = itemsFromGroup();
    const problems = [];

    for (const it of items) {
      if (it.kind === 'decor') continue; // 院墙/围栏这类"套着别人"的结构不参与检查
      const under = terrainSpanUnder(it);
      const onLand = under.hi > 0.2;
      if (!onLand) {
        // 码头/渔船本来就伸到水上，跳过浮空/埋深检查
        continue;
      }
      const skipVertical = it.kind === 'rock'; // 石头半埋是故意的
      const floatGap = it.minY - under.hi;
      const sinkDepth = under.lo - it.minY;
      if (!skipVertical && floatGap > 0.4) {
        problems.push({
          type: '浮空',
          name: it.name,
          x: +it.cx.toFixed(1),
          z: +it.cz.toFixed(1),
          detail: `底部比地形高 ${floatGap.toFixed(2)}m`
        });
      }
      if (!skipVertical && sinkDepth > 0.9 && it.height < 6 && it.kind !== 'compound') {
        problems.push({
          type: '埋进地形',
          name: it.name,
          x: +it.cx.toFixed(1),
          z: +it.cz.toFixed(1),
          detail: `埋深 ${sinkDepth.toFixed(2)}m`
        });
      }
      // 道路检查：只看小道具与地标（院墙/石厝本来就贴着路，用外接圆判断会误报）
      if (it.kind === 'prop' || it.kind === 'landmark') {
        const roadGap = roadDistance(it.cx, it.cz);
        if (roadGap < it.r * 0.55) {
          problems.push({
            type: '压在路上',
            name: it.name,
            x: +it.cx.toFixed(1),
            z: +it.cz.toFixed(1),
            detail: `侵入路缘 ${(it.r * 0.55 - roadGap).toFixed(2)}m`
          });
        }
        const pondGap = pondClearance(it.cx, it.cz);
        if (pondGap < it.r * 0.35 && pondGap > -0.01) {
          problems.push({
            type: '压在水边',
            name: it.name,
            x: +it.cx.toFixed(1),
            z: +it.cz.toFixed(1),
            detail: `离池塘 ${pondGap.toFixed(2)}m`
          });
        }
      }
    }

    // 物件互相重叠（跳过同一组的东西、跳过院墙与石厝这类"套着"的结构、跳过石头对石头）
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.kind === 'decor' || b.kind === 'decor') continue;
        if (a.kind === 'compound' && b.kind === 'compound') continue;
        if (a.tag && a.tag === b.tag) continue;
        if (a.kind === 'rock' && b.kind === 'rock') continue;
        const d = Math.hypot(a.cx - b.cx, a.cz - b.cz);
        const overlap = a.r + b.r - d;
        if (overlap <= 0.15) continue;
        const yOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (yOverlap <= 0.2) continue;
        const ratio = overlap / Math.min(a.r, b.r);
        if (ratio < 0.3) continue;
        problems.push({
          type: '物件重叠',
          name: `${a.name} × ${b.name}`,
          x: +((a.cx + b.cx) / 2).toFixed(1),
          z: +((a.cz + b.cz) / 2).toFixed(1),
          detail: `重叠 ${overlap.toFixed(2)}m（${(ratio * 100).toFixed(0)}%）`
        });
      }
    }

    return {
      itemCount: items.length,
      problems,
      byType: problems.reduce((acc, p) => {
        acc[p.type] = (acc[p.type] ?? 0) + 1;
        return acc;
      }, {})
    };
  };
}
