(() => {
  'use strict';
  const key = 'hexuColorMode';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let mode = 'system';
  let nativeDark;
  try {
    const saved = localStorage.getItem(key);
    if (['system', 'light', 'dark'].includes(saved)) mode = saved;
  } catch (_) {}

  function render() {
    const dark = mode === 'dark' || (mode === 'system' && (nativeDark ?? system.matches));
    root.dataset.colorMode = dark ? 'dark' : 'light';
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#101417' : '#f5f6f8');
    document.querySelectorAll('[name=colorMode]').forEach(input => {
      input.checked = mode === input.value;
      input.parentElement.classList.toggle('color-mode-selected', input.checked);
    });
  }

  function syncNative() {
    void fetch('/api/appearance/color-mode', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({mode})
    }).catch(() => {});
  }

  render();
  system.addEventListener('change', render);
  window.addEventListener('jxau:system-color', event => { nativeDark = event.detail === true; render(); });
  document.addEventListener('DOMContentLoaded', () => {
    render();
    document.querySelectorAll('[name=colorMode]').forEach(input => {
      input.addEventListener('change', () => {
        try {
          localStorage.setItem(key, input.value);
          mode = input.value;
          render();
          syncNative();
        } catch (_) { render(); window.Jxau?.toast('夜间模式未能保存'); }
      });
    });
  });
  window.addEventListener('jxau:foreground', render);
})();
