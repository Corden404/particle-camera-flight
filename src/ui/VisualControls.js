import {
  VISUAL_GROUPS, VISUAL_DEFAULTS, normalizeVisualSettings,
  readVisualSettings, writeVisualSettings
} from '../controls/visual-settings.js';

// Non-modal controls deliberately leave the WebGL scene running in the background.
export function createVisualControls({ panel, trigger, onChange }) {
  const doc = panel.ownerDocument;
  let storage = null;
  try { storage = doc.defaultView?.localStorage; } catch { /* private contexts */ }
  const settings = readVisualSettings(storage);
  const host = panel.querySelector('[data-visual-groups]');
  const status = panel.querySelector('[data-visual-status]');
  const inputs = new Map();
  let open = false;

  for (const group of VISUAL_GROUPS) {
    const section = doc.createElement('section');
    section.className = 'visual-controls-group';
    const heading = doc.createElement('h3');
    heading.textContent = group.title;
    section.append(heading);
    const note = doc.createElement('p');
    note.className = 'visual-controls-note';
    note.textContent = group.note;
    section.append(note);
    for (const control of group.controls) {
      const wrapper = doc.createElement('div');
      wrapper.className = 'visual-control';
      const line = doc.createElement('div');
      line.className = 'visual-control-line';
      const label = doc.createElement('label');
      const id = 'visual-' + control.key;
      label.htmlFor = id;
      label.textContent = control.label;
      const value = doc.createElement('output');
      value.htmlFor = id;
      line.append(label, value);
      const input = doc.createElement('input');
      input.type = 'range';
      input.id = id;
      input.name = control.key;
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = '0.05';
      input.setAttribute('aria-label', control.label);
      input.addEventListener('input', () => {
        settings[control.key] = normalizeVisualSettings({
          ...settings, [control.key]: Number(input.value)
        })[control.key];
        updateDisplay(control, input, value);
        const saved = writeVisualSettings(storage, settings);
        status.textContent = saved ? '已自动保存 · 正在实时预览' : '正在实时预览 · 本地保存受限';
        onChange(settings);
      });
      wrapper.append(line, input);
      section.append(wrapper);
      inputs.set(control.key, { input, value, control });
    }
    host.append(section);
  }

  function updateDisplay(control, input, output) {
    input.value = String(settings[control.key]);
    output.value = Math.round(settings[control.key] * 100) + '%';
    input.style.setProperty('--fill', ((settings[control.key] - control.min) /
      (control.max - control.min) * 100).toFixed(1) + '%');
  }
  function refresh() {
    for (const { control, input, value } of inputs.values()) updateDisplay(control, input, value);
  }
  function setOpen(next, { restoreFocus = true } = {}) {
    open = Boolean(next);
    const returnFocus = !open && restoreFocus && panel.contains(doc.activeElement);
    panel.hidden = !open;
    panel.inert = !open;
    trigger.setAttribute('aria-expanded', String(open));
    trigger.setAttribute('aria-label', open ? '关闭视觉调节' : '打开视觉调节');
    if (open) panel.querySelector('[data-visual-close]').focus({ preventScroll: true });
    else if (returnFocus) trigger.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => setOpen(!open));
  panel.querySelector('[data-visual-close]').addEventListener('click', () => setOpen(false));
  panel.querySelector('[data-visual-reset]').addEventListener('click', () => {
    Object.assign(settings, VISUAL_DEFAULTS);
    refresh();
    const saved = writeVisualSettings(storage, settings);
    status.textContent = saved ? '已恢复默认值并保存' : '已恢复默认值 · 本地保存受限';
    onChange(settings);
  });
  panel.querySelector('[data-visual-copy]').addEventListener('click', async () => {
    try {
      await doc.defaultView.navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      status.textContent = '参数 JSON 已复制';
    } catch {
      status.textContent = '浏览器未授权复制；调节值仍自动保存';
    }
  });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  });
  refresh();
  return {
    settings,
    get isOpen() { return open; },
    close(options) { setOpen(false, options); },
    toggle() { setOpen(!open); },
    // Used in tests and for future saved-presets support.
    replace(values) {
      Object.assign(settings, normalizeVisualSettings(values));
      refresh();
      writeVisualSettings(storage, settings);
      onChange(settings);
    }
  };
}
