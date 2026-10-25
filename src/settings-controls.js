import { applyCustom } from './custom-theme.js';

export const modeOrder = ['economy', 'balanced', 'quality'];
const modes = {
  economy: ['Производительность', 'Без украшений и анимаций. Меньше расход памяти.'],
  balanced: ['Баланс', 'Мягкие эффекты с умеренной нагрузкой.'],
  quality: ['Качество', 'Плавные анимации и выразительные обложки.'],
  manual: ['Свои настройки', 'Твои параметры. Сдвинь ползунок, чтобы включить готовый режим.'],
};
export const radiusLabel = value => value < 20 ? 'Сдержанная' : value < 30 ? 'Мягкая' : 'Округлая';

export function settingsControls({ $, preferences, store, onProfile }) {
  const tabs = [$('#settings-basic-tab'), $('#settings-advanced-tab')];
  const panels = [$('#settings-basic'), $('#settings-detailed')];
  let lastPreset = modeOrder.includes(preferences.profile) ? preferences.profile : 'balanced';
  let previewTimer; let saveTimer; let pendingSave = false;
  let dragging = false;
  const slider = $('#performance-level'); const rail = $('#performance-rail');
  const position = value => rail.style.setProperty('--performance-progress', String(Math.max(0, Math.min(1, Number(value) / 2))));
  function tab(index, focus = false) {
    tabs.forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((button, index) => {
    button.onclick = () => tab(index);
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); tab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true);
    };
  });
  $('#performance-level').oninput = event => {
    const value = Number(event.target.value); position(value);
    const profile = modeOrder[Math.round(value)];
    if (!profile || preferences.profile === profile) return;
    lastPreset = profile; onProfile(profile);
  };
  slider.onpointerdown = () => { dragging = true; rail.classList.add('is-dragging'); };
  slider.onpointerup = slider.onpointercancel = () => { dragging = false; rail.classList.remove('is-dragging'); const value = Math.round(Number(slider.value)); slider.value = String(value); position(value); };
  slider.onchange = () => { if (!dragging) { slider.value = String(Math.round(Number(slider.value))); position(slider.value); } };
  slider.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.round(Number(slider.value));
    slider.value = String(event.key === 'Home' ? 0 : event.key === 'End' ? 2 : Math.max(0, Math.min(2, current + (['ArrowRight','ArrowUp'].includes(event.key) ? 1 : -1))));
    slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true }));
  };
  $('#manual-mode').onchange = event => onProfile(event.target.checked ? 'manual' : lastPreset);

  function radius() {
    const label = radiusLabel(preferences.custom.radius);
    $('#custom-radius').value = String(preferences.custom.radius);
    $('#custom-radius').setAttribute('aria-valuetext', label);
    $('#custom-radius-value').textContent = label;
  }
  function flush() {
    clearTimeout(saveTimer);
    if (pendingSave) { pendingSave = false; store(); }
  }
  const showPreviewButton = () => { $('#radius-preview-toggle').hidden = false; };
  $('#radius-editor').onpointerenter = () => { clearTimeout(previewTimer); previewTimer = setTimeout(showPreviewButton, 350); };
  $('#radius-editor').onpointerleave = () => clearTimeout(previewTimer);
  $('#custom-radius').onfocus = showPreviewButton;
  $('#custom-radius').onpointerdown = showPreviewButton;
  $('#custom-radius').oninput = event => {
    preferences.custom.radius = Number(event.target.value);
    applyCustom(document.documentElement, preferences.custom); radius(); showPreviewButton();
    clearTimeout(saveTimer); pendingSave = true; saveTimer = setTimeout(flush, 180);
  };
  $('#custom-radius').onchange = flush;
  $('#custom-radius').onblur = flush;
  $('#radius-preview-toggle').onclick = () => {
    const open = $('#radius-preview').hidden;
    $('#radius-preview').hidden = !open;
    $('#radius-preview-toggle').setAttribute('aria-expanded', String(open));
    $('#radius-preview-toggle').textContent = open ? 'Скрыть пример' : 'Показать пример';
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  return {
    render() {
      const mode = modes[preferences.profile];
      if (!dragging) { slider.value = String(Math.max(0, modeOrder.indexOf(preferences.profile === 'manual' ? lastPreset : preferences.profile))); position(slider.value); }
      $('#performance-level').setAttribute('aria-valuetext', mode[0]);
      $('#performance-name').textContent = mode[0]; $('#performance-description').textContent = mode[1];
      $('#manual-mode').checked = preferences.profile === 'manual';
      radius();
    },
  };
}
