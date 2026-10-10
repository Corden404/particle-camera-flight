// Visual tuning values are multipliers; defaults capture the approved preset.
// This module is intentionally DOM-free so the schema and persistence are testable.
export const VISUAL_STORAGE_KEY = 'leeq.visual-controls.v1';

export const VISUAL_GROUPS = [
  {
    title: '主体模型', note: '让形体更清晰或更有生命力',
    controls: [
      { key: 'modelSaturation', label: '色彩饱和度', min: 0, max: 1.6 },
      { key: 'modelBrightness', label: '模型亮度', min: 0.35, max: 1.8 },
      { key: 'modelSize', label: '粒子大小', min: 0.55, max: 1.8 },
      { key: 'modelMotion', label: '表面流动', min: 0, max: 2 },
      { key: 'modelTwinkle', label: '明灭闪烁', min: 0, max: 2 }
    ]
  },
  {
    title: '空间背景', note: '背景与细点阵分别可调',
    controls: [
      { key: 'ambientSaturation', label: '背景饱和度', min: 0, max: 1.8 },
      { key: 'ambientBrightness', label: '背景亮度', min: 0, max: 2 },
      { key: 'ambientDensity', label: '漂浮粒子密度', min: 0, max: 1 },
      { key: 'gridBrightness', label: '细点阵亮度', min: 0, max: 2 }
    ]
  },
  {
    title: '互动与镜头', note: '移动鼠标或左键点击查看反馈',
    controls: [
      { key: 'pointerStrength', label: '鼠标扰动', min: 0, max: 2 },
      { key: 'clickStrength', label: '点击涟漪', min: 0, max: 2 },
      { key: 'cameraSway', label: '镜头晃动', min: 0, max: 2 }
    ]
  },
  {
    title: '章节切换', note: '切换到下一章节时观察分散范围',
    controls: [
      { key: 'scatter', label: '粒子散开范围', min: 0.3, max: 2.5 }
    ]
  }
];

export const VISUAL_DEFAULTS = Object.freeze({
  modelSaturation: 1,
  modelBrightness: 1.25,
  modelSize: 0.6,
  modelMotion: 1,
  modelTwinkle: 1,
  ambientSaturation: 1,
  ambientBrightness: 1.5,
  ambientDensity: 1,
  gridBrightness: 2,
  pointerStrength: 0.5,
  clickStrength: 1,
  cameraSway: 0.6,
  scatter: 2
});

export function normalizeVisualSettings(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = {};
  for (const group of VISUAL_GROUPS) {
    for (const control of group.controls) {
      const value = input[control.key];
      const valid = typeof value === 'number' && Number.isFinite(value) ?
        value : VISUAL_DEFAULTS[control.key];
      const clamped = Math.max(control.min, Math.min(control.max, valid));
      result[control.key] = Math.round(clamped * 20) / 20;
    }
  }
  return result;
}

export function readVisualSettings(storage) {
  try {
    const stored = storage?.getItem(VISUAL_STORAGE_KEY);
    return normalizeVisualSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return normalizeVisualSettings(null);
  }
}

export function writeVisualSettings(storage, settings) {
  try {
    if (!storage) return false;
    storage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(normalizeVisualSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
