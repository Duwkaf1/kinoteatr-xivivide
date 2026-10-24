export const DEFAULT_CUSTOM = Object.freeze({ background: '#15171c', panel: '#20232b', text: '#eeeef2', accent: '#f2c48f', radius: 28 });
export const isHexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function validateCustom(input) {
  const value = input && typeof input === 'object' ? input : {};
  const result = { ...DEFAULT_CUSTOM };
  for (const key of ['background', 'panel', 'text', 'accent']) if (isHexColor(value[key])) result[key] = value[key].toLowerCase();
  if (Number.isFinite(value.radius)) result.radius = Math.min(36, Math.max(12, Math.round(value.radius)));
  return result;
}
export function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contrast(a, b) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function applyCustom(root, input) {
  const colors = validateCustom(input);
  for (const key of ['background', 'panel', 'text', 'accent']) root.style.setProperty(`--custom-${key}`, colors[key]);
  root.style.setProperty('--custom-radius', `${colors.radius}px`);
  root.style.setProperty('--custom-accent-ink', contrast(colors.accent, '#000000') >= contrast(colors.accent, '#ffffff') ? '#000000' : '#ffffff');
  root.dataset.customScheme = luminance(colors.background) > 0.4 ? 'light' : 'dark';
}
