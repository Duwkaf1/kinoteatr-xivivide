import { applyCustom } from './custom-theme.js';

export const modeOrder = ['economy', 'balanced', 'quality'];
const modes = {
  economy: ['Производительность', 'Для слабого компьютера: без украшений и анимаций, меньше обложек за один раз и меньше расход памяти.'],
  balanced: ['Баланс', 'Удобный повседневный просмотр: спокойный интерфейс и умеренная нагрузка.'],
  quality: ['Качество', 'Объёмные обложки, мягкие переходы и красивые детали интерфейса.'],
  manual: ['Свои настройки', 'Используются твои подробные параметры. Выбери положение ползунка, чтобы вернуться к готовому режиму.'],
};
export const radiusLabel = value => value < 20 ? 'Сдержанная' : value < 30 ? 'Мягкая' : 'Округлая';

export function settingsControls({ $, preferences, store, onProfile }) {
  const tabs = [$('#settings-basic-tab'), $('#settings-advanced-tab')];
  const panels = [$('#settings-basic'), $('#settings-detailed')];
  let lastPreset = modeOrder.includes(preferences.profile) ? preferences.profile : 'balanced';
  let previewTimer; let saveTimer; let pendingSave = false;
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
    const profile = modeOrder[Number(event.target.value)];
    if (!profile || preferences.profile === profile) return;
    lastPreset = profile; onProfile(profile);
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
      $('#performance-level').value = String(Math.max(0, modeOrder.indexOf(preferences.profile === 'manual' ? lastPreset : preferences.profile)));
      $('#performance-level').setAttribute('aria-valuetext', mode[0]);
      $('#performance-name').textContent = mode[0]; $('#performance-description').textContent = mode[1];
      $('#manual-mode').checked = preferences.profile === 'manual';
      radius();
    },
  };
}
