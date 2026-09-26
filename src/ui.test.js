import pkg from 'jsdom';
const { JSDOM, VirtualConsole } = pkg;
import fs from 'node:fs';
import assert from 'node:assert';

const strip = (src) => src
  .replace(/^import\s.*$/gm, '')
  .replace(/^export\s+/gm, '');

const bundle = ['src/data.js', 'src/engine.js', 'src/app.js']
  .map((f) => strip(fs.readFileSync(f, 'utf8')))
  .join('\n;\n');

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', (e) => errors.push(e.message));

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
window.eval(bundle);
await new Promise((r) => setTimeout(r, 50));

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => [...doc.querySelectorAll(s)];
let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('  ✓', name); };
const userAction = (fn) => { fn(); return new Promise((r) => setTimeout(r, 40)); };

test('默认加载后地图渲染全部雪道/缆车/关闭道/高亮路线', () => {
  assert.ok($$('#layer-skis path').length >= 15, '雪道数');
  assert.equal($$('#layer-lifts path').length, 4);
  assert.equal($$('#layer-closed path').length, 2);
  assert.ok($$('#layer-plan path').length > 0, '应高亮推荐路线');
});
test('默认结果包含 4 项汇总与路段卡片', () => {
  assert.equal($$('#summary .stat').length, 4);
  assert.ok($$('#timeline .seg').length >= 3);
});
test('目标雪道被标记一次', () => assert.equal($$('#timeline .tag.target').length, 1));
test('每个雪道段都有合法风险徽标', () => {
  $$('#timeline .seg:not(.lift) .badge')
    .forEach((b) => assert.ok(['高风险', '中风险', '低风险'].includes(b.textContent.trim())));
});

await userAction(() => {
  $$('.level-btn').find((b) => b.dataset.level === '4').click();
  $('#target').value = 'e1';
  $('#target').dispatchEvent(new window.Event('change'));
});
test('专家级选云顶黑道：贴顶+结冰高风险', () => {
  assert.ok($('#timeline').textContent.includes('贴顶'));
  assert.ok($('#timeline').textContent.includes('结冰'));
});

await userAction(() => { $$('.level-btn').find((b) => b.dataset.level === '1').click(); });
test('初级用户下拉中黑道标注超出水平', () => {
  assert.ok($$('#target option[value="e1"]')[0].textContent.includes('超出当前水平'));
});
await userAction(() => {
  $('#target').value = 'e1';
  $('#target').dispatchEvent(new window.Event('change'));
});
test('选超出水平雪道 -> 告警拦截且地图清空高亮', () => {
  assert.ok($('#timeline .alert'), '应显示告警');
  assert.ok($('#timeline').textContent.includes('高于'));
  assert.equal($$('#layer-plan path').length, 0);
});

test('关闭雪道在下拉中禁用', () => {
  ['e18', 'e19'].forEach((id) => assert.ok($(`#target option[value="${id}"]`).disabled));
});

await userAction(() => {
  $$('.level-btn').find((b) => b.dataset.level === '2').click();
  $('#target').value = 'e8';
  $('#target').dispatchEvent(new window.Event('change'));
  $('#rest').value = '';
  $('#rest').dispatchEvent(new window.Event('change'));
});
test('无休息站：路线末段抵达大本营', () => {
  assert.ok($$('#timeline .seg').at(-1).textContent.includes('大本营'));
});

await userAction(() => {
  $('#lift').value = 'L3';
  $('#lift').dispatchEvent(new window.Event('change'));
});
test('切换3号缆车起点后仍生成路线', () => assert.ok($$('#timeline .seg').length >= 1));

await userAction(() => {
  $('#rest').value = 'r4';
  $('#rest').dispatchEvent(new window.Event('change'));
  $('#target').value = 'e12';
  $('#target').dispatchEvent(new window.Event('change'));
});
test('公园线+暖阳休息站：顺序说明与目标标记正确', () => {
  assert.equal($$('#timeline .tag.target').length, 1);
  assert.ok(/休息站|目标雪道/.test($('#orderNote').textContent));
});

console.log(`\nUI 冒烟测试 ${pass} 项通过 ✅`);
console.log('jsdom 运行时错误:', errors.length ? errors : '无');
if (errors.length) process.exit(1);
