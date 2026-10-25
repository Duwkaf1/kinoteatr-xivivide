export const DEFAULT_CUSTOM = Object.freeze({ background: '#15171c', panel: '#20232b', text: '#eeeef2', accent: '#f2c48f', radius: 28, comfort: true });
export const isHexColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function validateCustom(input) {
  const value = input && typeof input === 'object' ? input : {};
  const result = { ...DEFAULT_CUSTOM };
  for (const key of ['background', 'panel', 'text', 'accent']) if (isHexColor(value[key])) result[key] = value[key].toLowerCase();
  if (Number.isFinite(value.radius)) result.radius = Math.min(36, Math.max(12, Math.round(value.radius)));
  if (typeof value.comfort === 'boolean') result.comfort = value.comfort;
  return result;
}
export function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contrast(a, b) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function mixColor(a, b, ratio) {
  return '#' + [1,3,5].map(offset=>Math.round(parseInt(a.slice(offset,offset+2),16)*(1-ratio)+parseInt(b.slice(offset,offset+2),16)*ratio).toString(16).padStart(2,'0')).join('');
}
export function readableColor(preferred, background, target=4.5) {
  if(contrast(preferred,background)>=target)return preferred;
  const endpoint=contrast('#ffffff',background)>=contrast('#000000',background)?'#ffffff':'#000000';
  let lo=0,hi=1;
  for(let i=0;i<16;i++){const middle=(lo+hi)/2;if(contrast(mixColor(preferred,endpoint,middle),background)>=target)hi=middle;else lo=middle;}
  return mixColor(preferred,endpoint,hi);
}
export function customPalette(input) {
  const raw=validateCustom(input);
  const surface=color=>{
    if(!raw.comfort)return color;
    const channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));const chroma=(Math.max(...channels)-Math.min(...channels))/255;
    return mixColor(color,luminance(color)>.4?'#f5f4f0':'#17191f',Math.max(0,(chroma-.28)/.72)*.9);
  };
  const background=surface(raw.background), panel=surface(raw.panel);
  const text=readableColor(raw.text,background,7);const panelText=readableColor(raw.text,panel,7);
  const target=luminance(panel)>.4?'#000000':'#ffffff';const soft=mixColor(panel,target,.045);const raised=mixColor(panel,target,.085);
  const muted=(ink,bg)=>readableColor(mixColor(ink,bg,.28),bg);
  const accent=readableColor(raw.accent,background);const panelAccent=readableColor(raw.accent,panel);
  const ink=bg=>contrast(bg,'#000000')>=contrast(bg,'#ffffff')?'#000000':'#ffffff';
  const controlText=readableColor(raw.text,soft,7);
  return {background,panel,text,muted:muted(text,background),panelText,panelMuted:muted(panelText,panel),controlText,controlMuted:muted(controlText,soft),soft,raised,accent,accentInk:ink(accent),panelAccent,panelAccentInk:ink(panelAccent),line:mixColor(panelText,panel,.72)};
}
export function applyCustom(root, input) {
  const colors = validateCustom(input);
  for (const key of ['background', 'panel', 'text', 'accent']) root.style.setProperty(`--custom-${key}`, colors[key]);
  root.style.setProperty('--custom-radius', `${colors.radius}px`);
  root.style.setProperty('--custom-accent-ink', contrast(colors.accent, '#000000') >= contrast(colors.accent, '#ffffff') ? '#000000' : '#ffffff');
  const palette = customPalette(colors);
  for (const [key, value] of Object.entries(palette)) root.style.setProperty(`--custom-safe-${key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())}`, value);
  root.dataset.customScheme = luminance(palette.background) > 0.4 ? 'light' : 'dark';
}
