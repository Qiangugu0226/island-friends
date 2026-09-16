// 大黄各状态验收截图：躲藏 / 近线索 / 警觉 / 吓跑 / 观察卡 / 投喂
// 用法：node tools/shoot-dog.mjs [场景名...]   不传就全拍
import { mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const SCENARIOS = {
  hidden: { label: '躲藏中（远/中线索：脚印·羽毛·草动）', playerDist: 9, posture: 'crouch', cam: [4.6, 3.0, 6.6], hideout: 1 },
  near: { label: '近线索（露出尾巴尖与眼睛反光）', playerDist: 3.4, posture: 'crouch', cam: [3.0, 2.3, 5.0], hideout: 1 },
  alert: { label: '警觉（头顶 ?）', playerDist: 5, posture: 'crouch', force: 'alert', cam: [4.0, 2.8, 5.6], hideout: 1 },
  flee: { label: '吓跑（头顶 !）', playerDist: 6, posture: 'walk', force: 'flee', cam: [5.4, 3.4, 7.0], hideout: 1, shotDelay: 350 },
  observe: { label: '观察卡（galgame 式）', playerDist: 3.0, posture: 'crouch', press: 'KeyE', follow: 5.5, hideout: 1 },
  feed: { label: '投喂成功（爱心 + 好感度）', playerDist: 3.0, posture: 'crouch', aff: 20, food: ['bone', 3], press: 'KeyF', follow: 5.5, hideout: 1 },
  curious: { label: '认识之后（不再跑，看着你）', playerDist: 5, posture: 'walk', aff: 20, cam: [4.2, 2.8, 5.8], hideout: 1 }
};

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const names = want.length ? want : Object.keys(SCENARIOS);

const target = await pickTarget();
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]),
  headless: true,
  args: [...BROWSER_ARGS, '--window-size=1600,900']
});
mkdirSync('shots', { recursive: true });

for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) {
    console.log(`跳过未知场景：${name}`);
    continue;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
  await delay(600);

  await delay(500);
  // 先蹲下（姿态先生效，否则一传送就被吓跑），再传送与设置状态
  if (sc.posture === 'crouch') {
    await page.keyboard.down('KeyC');
    await delay(400);
  }
  const info = await page.evaluate(
    (cfg) => {
      const api = window.__island;
      const d0 = api.dog();
      const px = d0.position[0];
      const pz = d0.position[2];
      const py = d0.position[1]; // 地面高度：相机要跟着抬起来，否则会拍到地底下
      const a = cfg.angle ?? 0.5;
      const dx = Math.sin(a) * cfg.playerDist;
      const dz = Math.cos(a) * cfg.playerDist;
      api.teleport(px + dx, pz + dz);
      api.jumpDog(cfg.hideout);
      if (cfg.aff !== undefined) api.setAffection(cfg.aff);
      if (cfg.food) api.giveFood(cfg.food[0], cfg.food[1]);
      if (cfg.force) api.forceDogMode(cfg.force);
      if (cfg.cam) {
        api.setFreeCam(
          [px + cfg.cam[0], py + cfg.cam[1], pz + cfg.cam[2]],
          [px + dx * 0.35, py + 0.8, pz + dz * 0.35]
        );
      } else if (cfg.follow) {
        api.setFollow(cfg.follow);
      }
      return { dog: api.dog() };
    },
    sc
  );

  await delay(1500); // 让状态迁移与动画稳定
  if (sc.press) {
    await page.keyboard.press(sc.press);
    await delay(sc.shotDelay ?? 420);
  }
  await page.screenshot({ path: `shots/p2-${name}.png` });
  const state = await page.evaluate(() => ({ dog: window.__island.dog(), ui: window.__island.uiState(), aff: window.__island.affection() }));
  console.log(`✅ shots/p2-${name}.png  ${sc.label}`);
  console.log(`   mode=${state.dog.mode} tier=${state.dog.tier} dist=${state.dog.distance} 好感=${state.aff.value}(${state.aff.level}) 卡片=${state.ui.card} 准星=${state.ui.crosshairGold ? '金' : '白'}`);
  if (errs.length) console.log('   页面错误：', errs.slice(0, 3).join(' | '));
  await page.close();
}

await browser.close();
