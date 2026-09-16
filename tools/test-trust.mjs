// 大黄信任闭环自动测试：潜行 / 警觉 / 吓跑 / 观察 / 投喂 / 好感度 / 三层线索
// 用法：node tools/test-trust.mjs      （自动选择开发服务器或单文件离线版）
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { pickTarget, BROWSER_ARGS, browserPath } from './lib/target.mjs';

const target = await pickTarget();
const browser = await puppeteer.launch({
  executablePath: browserPath([
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ]),
  headless: true,
  args: [...BROWSER_ARGS, '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__island && window.__island.ready === true', { timeout: 180000 });
await delay(700);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
};

const dog = () => page.evaluate(() => window.__island.dog());
const aff = () => page.evaluate(() => window.__island.affection());
const ui = () => page.evaluate(() => window.__island.uiState());
const ev = (fn, arg) => page.evaluate(fn, arg);
const give = (id, n) => ev(([a, b]) => window.__island.giveFood(a, b), [id, n]);
const move = (x, z) => ev(([a, b]) => window.__island.teleport(a, b), [x, z]);
const tap = async (key) => {
  await page.keyboard.press(key);
  await delay(280);
};
const settle = (ms = 700) => delay(ms);
const crouch = () => page.keyboard.down('KeyC');
const stand = () => page.keyboard.up('KeyC');
const jumpDog = (i) => ev((n) => window.__island.jumpDog(n), i);

async function standAt(dist, angle = 0) {
  const d = await dog();
  await move(d.position[0] + Math.sin(angle) * dist, d.position[2] + Math.cos(angle) * dist);
  await settle(500);
}

// 把「玩家姿态 + 大黄状态」重置到干净起点
async function reset(posture) {
  await stand();
  await ev(() => window.__island.setAffection(0));
  await move(-44, 30); // 先把玩家挪远，避免重置瞬间惊动它
  await settle(300);
  if (posture === 'crouch') await crouch();
  await jumpDog(0);
  await settle(400);
}

console.log(`目标：${target.kind === 'file' ? '单文件离线版' : target.url}\n`);

console.log('=== 1. 初始状态 ===');
let d = await dog();
check('大黄在场且有多个躲藏点', d.hideouts.length >= 3, `${d.hideouts.length} 个：${d.hideouts.map((h) => h.label).join(' / ')}`);

console.log('\n=== 2. 站着走近 → 吓跑（无惩罚，会换窝） ===');
await reset('walk');
const before = (await dog()).hideout;
await standAt(5);
d = await dog();
check('站着靠近会吓跑', d.mode === 'flee', `mode=${d.mode} dist=${d.distance}`);
await settle(13000); // 无头浏览器帧率低，模拟时间比真实时间慢，多等一会儿
d = await dog();
check('跑到另一个窝重新躲好', d.mode === 'hidden' && d.hideout !== before, `${before} → ${d.hideout}`);

console.log('\n=== 3. 蹲行靠近 → 只警觉，不跑 ===');
await reset('crouch');
await standAt(5);
d = await dog();
check('按 C 蹲行靠近只是警觉', d.mode === 'alert', `mode=${d.mode} dist=${d.distance} tier=${d.tier}`);

console.log('\n=== 4. 蹲到 3m 内 → 准星金黄 + 按 E 观察 ===');
await standAt(3.0);
let u = await ui();
check('进入观察范围后准星变金黄', u.crosshairGold === true, `observable=${u.observable} dist=${u.dogDist} mode=${u.dogMode}`);
check('屏幕提示按 E 观察', String(u.prompt).includes('E'), `prompt="${u.prompt}"`);
await tap('KeyE');
u = await ui();
let a = await aff();
check('按 E 弹出观察卡', u.card === true);
check('首次观察后好感度 HUD 出现', u.affectionVisible === true && a.observed === true, `visible=${u.affectionVisible}`);
check('观察本身不加好感', a.value === 0, `value=${a.value}`);
await tap('KeyE');
check('再按 E 关闭观察卡', (await ui()).card === false);
await tap('KeyE');

console.log('\n=== 5. 投喂 ===');
await give('fish', 1);
await page.keyboard.press('Digit2');
await settle(200);
let r = await ev(() => window.__island.feed());
a = await aff();
check('先喂错食物：不感兴趣、不加好感', r.ok === false && a.value === 0, `reason=${r.reason} value=${a.value}`);

await ev(() => window.__island.resetFeedCooldown());
await give('bone', 2);
await page.keyboard.press('Digit1');
await settle(200);
r = await ev(() => window.__island.feed());
a = await aff();
check('喂对骨头：好感 +20', r.ok === true && a.value === 20, `gain=${r.gain} value=${a.value}`);
check('好感升到「认识」', a.level === '认识', `level=${a.level}`);

console.log('\n=== 6. 认识之后不再跑 ===');
await stand();
await standAt(5);
d = await dog();
check('好感 20 后站着靠近也不会跑', d.mode !== 'flee', `mode=${d.mode} dist=${d.distance}`);

console.log('\n=== 7. 熟悉之后会凑过来 ===');
await ev(() => window.__island.setAffection(60));
await move(-44, 30);
await settle(300);
await jumpDog(0);
await settle(400);
await standAt(8);
const distBefore = (await dog()).distance;
await settle(2800);
d = await dog();
check('好感 60 后会主动靠近', d.distance < distBefore - 0.5, `${distBefore} → ${d.distance}`);
check('熟悉等级正确', (await aff()).level === '熟悉');

console.log('\n=== 8. 三层线索随距离推进 ===');
await reset('crouch');
const bands = {};
for (const dist of [20, 11, 6, 2.8]) {
  await standAt(dist);
  const dd = await dog();
  bands[dist + 'm'] = `${dd.mode}/${dd.tier}`;
}
const tiers = Object.values(bands).map((v) => v.split('/')[1]);
check('远/中/近三层线索都出现过', tiers.includes('far') && tiers.includes('mid') && tiers.includes('near'), JSON.stringify(bands));
await stand();

console.log('\n=== 9. 背包 ===');
const inv = (await aff()).inventory;
console.log(`   骨=${inv.bone} 鱼=${inv.fish} 瓜子=${inv.seed} 水草=${inv.weed}`);

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n通过 ${pass}/${results.length}`);
if (errors.length) console.log('页面错误：', errors.slice(0, 5).join(' | '));
process.exit(pass === results.length ? 0 : 1);
