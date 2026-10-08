import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { labelSprite } from '../core/materials.js';

// 资产总览展台：把所有 P1 资产排成一行行，配标签，方便你逐件验收
export function createGallery(scene, cfg, assets, palette, extraItems = []) {
  const group = new THREE.Group();
  group.name = 'gallery';
  const rand = mulberry32(0x9a7b11c3);

  const cols = 7;
  const dx = 20;
  const dz = 24;

  const items = [
    { label: '石厝 · 红瓦', make: () => assets.makeStoneHouse(rand, { style: 'stone', w: 9.0, d: 7.4, wallH: 3.4, roofH: 2.6, roofTile: '#D9534F', ridge: '#B4553F', rot: 0 }) },
    { label: '石厝 · 黄瓦（白墙）', make: () => assets.makeStoneHouse(rand, { style: 'white', w: 8.4, d: 7.0, wallH: 3.2, roofH: 2.5, roofTile: '#E8B44A', ridge: '#B4553F', rot: 0 }) },
    { label: '红砖厝 · 青瓦', make: () => assets.makeStoneHouse(rand, { style: 'brick', w: 8.8, d: 7.2, wallH: 3.3, roofH: 2.6, roofTile: '#4FA3A5', ridge: '#D9453A', rot: 0 }) },
    { label: '石砌院墙', make: () => assets.makeStoneWallYard(13, 11, { gaps: [{ x: 0, z: 5.5, r: 2.6 }] }) },
    { label: '航标塔（地标）', make: () => assets.makeBeaconTower({ height: 14.5 }).group },
    { label: '土地庙', make: () => assets.makeShrine().group },
    { label: '梯田菜畦', make: () => assets.makeTerraceField(rand, { w: 14, d: 10, rot: 0 }) },
    { label: '石阶码头', make: () => assets.makeStonePier({ length: 15, width: 3.0 }) },
    { label: '木渔船', make: () => assets.makeFishingBoat(rand) },
    { label: '晒渔网架', make: () => assets.makeNetRack() },
    { label: '晒鱼干架', make: () => assets.makeDryingRack(rand) },
    { label: '中式水井', make: () => assets.makeWell() },
    { label: '石磨', make: () => assets.makeMillstone() },
    { label: '稻草堆', make: () => assets.makeHaystack(rand) },
    { label: '木桶', make: () => assets.makeBarrel() },
    { label: '南瓜', make: () => assets.makePumpkin(rand) },
    { label: '石凳', make: () => assets.makeStoneBench() },
    { label: '灯笼路灯（夜晚亮）', make: () => assets.makeLanternPost().group },
    { label: '晾衣绳', make: () => assets.makeClothesline() },
    { label: '信箱', make: () => assets.makeMailbox() },
    { label: '水缸', make: () => assets.makeWaterJar() },
    { label: '竹篓', make: () => assets.makeBasket(rand) },
    { label: '树 · 橘', make: () => assets.makeTree(rand, { height: 4.2, leaf: '#E8622C' }) },
    { label: '树 · 绿', make: () => assets.makeTree(rand, { height: 4.4, leaf: '#5FA83C' }) },
    { label: '榕树（大冠幅）', make: () => assets.makeBanyan(rand) },
    { label: '芭蕉', make: () => assets.makeBanana(rand) },
    { label: '竹丛', make: () => assets.makeBamboo(rand) },
    { label: '灌木', make: () => assets.makeBush(rand) },
    { label: '石头', make: () => assets.makeRock(rand) },
    { label: '野花', make: () => assets.makeFlower(rand) },
    { label: '树桩', make: () => assets.makeStump(rand) },
    { label: '草丛', make: () => assets.makeGrassTuft(rand) },
    ...extraItems
  ];

  const rows = Math.ceil(items.length / cols);
  const width = cols * dx + 10;
  const depth = rows * dz + 8;

  const platform = new THREE.Mesh(new THREE.BoxGeometry(width, 2.6, depth), assets.mat('#EFE6CE'));
  platform.position.set(cfg.x, -0.5, cfg.z);
  platform.receiveShadow = true;
  group.add(platform);

  const border = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1.2, depth + 2), assets.mat('#DCC79A'));
  border.position.set(cfg.x, -2.2, cfg.z);
  border.receiveShadow = true;
  group.add(border);

  const startX = cfg.x - ((cols - 1) * dx) / 2;
  const startZ = cfg.z - ((rows - 1) * dz) / 2;

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * dx;
    const z = startZ + row * dz;
    const obj = item.make();
    obj.position.set(x, 0.8, z);
    obj.rotation.y = -0.35;
    if (obj.isObject3D && !obj.parent) group.add(obj);

    const label = labelSprite(item.label, { scale: 0.028 });
    label.position.set(x, 8.4, z);
    group.add(label);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.6, 5), assets.mat('#C9B58A'));
    post.position.set(x, 4.2, z - 1.8);
    group.add(post);
  });

  scene.add(group);

  return {
    group,
    itemCount: items.length,
    rows,
    cols,
    cameraPos: new THREE.Vector3(cfg.x, 62, cfg.z + depth * 0.5 + 96),
    cameraLook: new THREE.Vector3(cfg.x, 6.0, cfg.z + 26)
  };
}
