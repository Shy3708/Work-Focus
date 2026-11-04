/* 仅用于本机联调：通过 Chrome DevTools Protocol 精确驱动/读取渲染层。 */
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT ?? '9222';

async function getPageTarget() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(e.error ?? e));
  });
}

function makeClient(ws) {
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const target = await getPageTarget();
  const ws = await connect(target.webSocketDebuggerUrl);
  const send = makeClient(ws);

  try {
    if (cmd === 'eval') {
      const result = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      console.log(JSON.stringify(result.result.value));
    } else if (cmd === 'rect') {
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim().slice(0, 40) }; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(JSON.stringify(result.result.value));
    } else if (cmd === 'click') {
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      const pt = result.result.value;
      if (!pt) throw new Error(`selector not found: ${arg}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: pt.x,
        y: pt.y,
        button: 'left',
        clickCount: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: pt.x,
        y: pt.y,
        button: 'left',
        clickCount: 1,
      });
      console.log(`clicked ${arg} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
    } else if (cmd === 'drag') {
      // drag <fromSelector> <toSelector> [steps]
      const [from, to, stepsArg] = [arg, process.argv[4], process.argv[5]];
      const steps = Number(stepsArg) || 12;
      const pick = async (selector) => {
        const expr = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
        const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        if (!result.result.value) throw new Error(`selector not found: ${selector}`);
        return result.result.value;
      };
      const start = await pick(from);
      const end = await pick(to);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: start.x,
        y: start.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let i = 1; i <= steps; i += 1) {
        const x = start.x + ((end.x - start.x) * i) / steps;
        const y = start.y + ((end.y - start.y) * i) / steps;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
      }
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: end.x,
        y: end.y,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      console.log(`dragged ${from} -> ${to} (${steps} steps)`);
    } else if (cmd === 'dragoffset') {
      // dragoffset <selector> <dx> <dy> [steps]
      const selector = arg;
      const dx = Number(process.argv[4]) || 0;
      const dy = Number(process.argv[5]) || 0;
      const steps = Number(process.argv[6]) || 12;
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      const start = result.result.value;
      if (!start) throw new Error(`selector not found: ${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: start.x,
        y: start.y,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      });
      for (let i = 1; i <= steps; i += 1) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: start.x + (dx * i) / steps,
          y: start.y + (dy * i) / steps,
          button: 'left',
          buttons: 1,
        });
      }
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: start.x + dx,
        y: start.y + dy,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
      console.log(`dragged ${selector} by ${dx},${dy}`);
    } else if (cmd === 'shot') {
      // shot <outFile>：直接截渲染层（按 CSS 像素 1:1 输出，不受系统 DPI 缩放影响，保留透明通道）
      const outFile = arg ?? 'docs/screenshots/_cdp-shot.png';
      const sizeRes = await send('Runtime.evaluate', {
        expression: 'JSON.stringify({ w: innerWidth, h: innerHeight })',
        returnByValue: true,
      });
      const size = JSON.parse(sizeRes.result.value);
      // 锁定 deviceScaleFactor=1，避免 125%/150% 缩放下导出图被放大
      await send('Emulation.setDeviceMetricsOverride', {
        width: size.w,
        height: size.h,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await send('Emulation.clearDeviceMetricsOverride');
      writeFileSync(outFile, Buffer.from(result.data, 'base64'));
      console.log(`saved ${outFile} ${size.w}x${size.h}`);
    } else if (cmd === 'fire') {
      // fire <selector> <eventType>：直接派发鼠标事件（用于驱动 dblclick 等）
      const selector = arg;
      const type = process.argv[4] ?? 'dblclick';
      const expr = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, {
          bubbles: true,
          cancelable: true,
          detail: 2,
          button: 2,
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        }));
        return true;
      })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(`${type} -> ${JSON.stringify(result.result.value)}`);
    } else if (cmd === 'press') {
      // press <key>：发送一次按键（Backspace / Enter / Escape 等）
      const key = arg ?? 'Backspace';
      const codeMap = { Backspace: 8, Enter: 13, Escape: 27, Delete: 46 };
      const vk = codeMap[key] ?? 0;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk });
      console.log(`pressed ${key}`);
    } else if (cmd === 'rows') {
      const expr = `(() => [...document.querySelectorAll('[data-item-id]')].map((el) => ({
        id: el.dataset.itemId,
        title: el.querySelector('.row-title')?.textContent ?? '',
        time: el.querySelector('.row-tag-time')?.textContent ?? '',
        pinned: el.classList.contains('is-pinned'),
      })))()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(JSON.stringify(result.result.value));
    } else if (cmd === 'count') {
      const expr = `document.querySelectorAll(${JSON.stringify(arg)}).length`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(JSON.stringify(result.result.value));
    } else if (cmd === 'dblclick') {
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      const pt = result.result.value;
      if (!pt) throw new Error(`selector not found: ${arg}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
      for (const clickCount of [1, 2]) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount });
      }
      console.log(`double-clicked ${arg} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
    } else if (cmd === 'value') {
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(arg)}); return el ? el.value : null; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      console.log(JSON.stringify(result.result.value));
    } else if (cmd === 'type') {
      // type <selector> <text>
      const selector = arg;
      const text = process.argv[4] ?? '';
      const expr = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return true; })()`;
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (!result.result.value) throw new Error(`selector not found: ${selector}`);
      await send('Input.insertText', { text });
      console.log(`typed into ${selector}: ${text}`);
    } else {
      throw new Error(`unknown command: ${cmd}`);
    }
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
