(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = 'hexuScheduleBackground:v1';
  const initial = {image: '', strength: 26};
  let saved = {...initial};
  let draft = {...initial};
  let generation = 0;
  let processing = false, saveMotion = [];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const file = $('bgFile');
  const slider = $('bgStrength');
  const maxStrength = Number(slider.max);
  const status = $('bgStatus');
  const preview = $('bgPreview');
  const previewImage = $('bgPreviewImage');
  const viewport = preview.querySelector('.bg-preview-viewport');
  const screen = viewport.querySelector('.bg-preview-screen');
  const previewWallpaper = previewImage.parentElement;
  const previewPage = screen.querySelector('.page');
  const previewNavigation = $('mainTabbar').cloneNode(true);
  previewNavigation.removeAttribute('id');
  previewNavigation.classList.remove('hidden');
  previewNavigation.classList.add('bg-preview-navigation');
  for (const tab of previewNavigation.querySelectorAll('[data-tab]')) {
    tab.classList.toggle('active', tab.dataset.tab === 'schedule');
    tab.removeAttribute('data-tab');
  }
  previewNavigation.querySelector('.nav-carry')?.remove();
  previewNavigation.querySelector('.dock-refraction')?.remove();
  for (const glyph of previewNavigation.querySelectorAll('.dock-glyph')) glyph.className = 'bg-preview-glyph';
  screen.append(previewNavigation);
  const wallpaper = $('scheduleWallpaper');
  const wallpaperImage = wallpaper.querySelector('img');

  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    if (typeof value.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.image)
        && value.image.length <= 1200000) {
      saved = {image: value.image, strength: Math.max(10, Math.min(maxStrength, Number(value.strength) || 26))};
    }
  } catch (_) {
    // Default appearance stays available if stored data is invalid.
  }

  function paintBackground(box, img, value) {
    box.style.setProperty('--wallpaper-opacity', String(value.strength / 100));
    if ((img.getAttribute('src') || '') !== value.image) {
      if (value.image) img.src = value.image;
      else img.removeAttribute('src');
    }
  }

  function applySaved() {
    wallpaper.hidden = !saved.image;
    $('schedule').classList.toggle('has-wallpaper', !!saved.image);
    paintBackground(wallpaper, wallpaperImage, saved);
  }

  function renderPreview() {
    if (document.body.dataset.page !== 'scheduleBackground' || !viewport.clientWidth) return;
    const timetable = window.Jxau.plan;
    const {week: activeWeek, total} = timetable.meta();
    const week = Math.max(1, activeWeek);
    const width = document.documentElement.clientWidth;
    const scale = viewport.clientWidth / width;
    screen.style.width = width + 'px';
    screen.style.minHeight = innerHeight + 'px';
    viewport.style.height = Math.round(innerHeight * scale) + 'px';
    screen.style.transform = 'none';
    const label = screen.querySelector('.schedule-week-label');
    label.textContent = '第 ' + week + ' 周';
    const weeks = document.createElement('small');
    weeks.textContent = '共 ' + total + ' 周';
    label.append(weeks);
    const source = screen.querySelector('.schedule-source');
    source.textContent = $('scheduleSource').textContent || '当前查看周';
    source.classList.toggle('is-warning', $('scheduleSource').classList.contains('is-warning'));
    const cache = screen.querySelector('.semester-cache-status');
    cache.className = $('semesterCacheStatus').className;
    cache.textContent = $('semesterCacheStatus').textContent;
    previewPage.innerHTML = timetable.gridHtml(week);
    window.JxauCalendar.renderPage(previewPage, week, false);
    screen.style.transform = 'scale(' + scale + ')';
  }

  function renderDraft() {
    previewWallpaper.hidden = !draft.image;
    screen.classList.toggle('has-wallpaper', !!draft.image);
    paintBackground(previewWallpaper, previewImage, draft);
    slider.value = draft.strength;
    $('bgStrengthValue').textContent = draft.strength + '%';
    slider.disabled = !draft.image || processing;
    $('bgChoose').disabled = processing;
    $('bgSave').disabled = !draft.image || processing ||
      (draft.image === saved.image && draft.strength === saved.strength);
    $('bgRemove').disabled = !saved.image || processing;
  }

  function store(value) {
    try {
      if (value.image) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      saved = {...value};
      applySaved();
      renderDraft();
      return true;
    } catch (_) {
      status.textContent = '本机空间不足或无法保存，请换一张图片重试。';
      return false;
    }
  }

  $('openScheduleBackground').onclick = () => {
    let from = document.body.dataset.page;
    if (!['schedule', 'schedulePreferences'].includes(from)) from = 'schedule';
    $('scheduleBackgroundBack').textContent = from === 'schedulePreferences' ? '‹ 课表设置' : '‹ 课表';
    if (location.hash !== '#/' + from) history.replaceState({h:'#/' + from}, '', '#/' + from);
    window.Jxau.showRoute('scheduleBackground');
    window.Jxau.pushRoute('#/scheduleBackground');
  };
  $('scheduleBackgroundBack').onclick = () => window.appBack();
  window.Jxau.registerPage('scheduleBackground', {
    onShow() {
      draft = {...saved};
      processing = false;
      file.value = '';
      status.textContent = saved.image ? '当前背景已应用。' : '选择一张图片预览课表效果。';
      renderDraft();
      renderPreview();
      requestAnimationFrame(renderPreview);
    },
    onHide() {
      generation++;
      saveMotion.forEach(animation => animation.cancel());
      saveMotion = [];
    }
  });
  if (window.ResizeObserver) new ResizeObserver(renderPreview).observe(viewport);
  addEventListener('resize', renderPreview);

  slider.oninput = () => {
    draft.strength = slider.valueAsNumber;
    renderDraft();
  };
  $('bgChoose').onclick = () => {
    file.value = '';
    file.click();
  };
  file.onchange = async () => {
    const selected = file.files[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/') || selected.type === 'image/svg+xml') {
      status.textContent = '请选择 JPEG、PNG 或手机支持的照片。';
      return;
    }
    if (selected.size > 12 * 1024 * 1024) {
      status.textContent = '请选择 12 MB 以内的图片。';
      return;
    }
    const current = ++generation;
    const source = URL.createObjectURL(selected);
    status.textContent = '正在生成预览…';
    processing = true;
    renderDraft();
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = source;
      });
      if (current !== generation) return;
      const width = img.naturalWidth, height = img.naturalHeight;
      if (!width || !height || width * height > 40000000) throw Error();
      const ratio = Math.min(1, 1200 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#eef2eb';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', .8);
      if (image.length > 1200000 || !image.startsWith('data:image/jpeg;base64,')) throw Error();
      draft.image = image;
      status.textContent = '调整背景浓度，满意后点击应用。';
    } catch (_) {
      if (current === generation) status.textContent = '无法处理这张图片，请换一张较小的照片。';
    } finally {
      URL.revokeObjectURL(source);
      if (current === generation) {
        processing = false;
        renderDraft();
      }
    }
  };
  $('bgSave').onclick = () => {
    if (processing || !draft.image || !store(draft)) return;
    status.textContent = '背景已应用到课表。';
    if (reducedMotion.matches || !preview.animate) return;
    saveMotion.forEach(animation => animation.cancel());
    saveMotion = [
      previewWallpaper.animate([{opacity: Math.max(0, draft.strength / 100 - .16)},
        {opacity: draft.strength / 100}], {duration: 460, easing: 'cubic-bezier(.22,.72,.27,1)'}),
      preview.querySelector('.bg-preview-confirm').animate([
        {opacity:0, transform:'translate(-50%, 5px)'},
        {opacity:1, transform:'translate(-50%, 0)', offset:.21},
        {opacity:1, transform:'translate(-50%, 0)', offset:.68},
        {opacity:0, transform:'translate(-50%, -3px)'}
      ], {duration: 900, easing: 'ease-in-out'})
    ];
  };
  $('bgRemove').onclick = async () => {
    const current = generation;
    if (!await window.HexuConfirm.ask('恢复默认背景？','已选图片会从禾序的课表背景中移除。','恢复默认')) return;
    if (current !== generation) return;
    if (store(initial)) {
      draft = {...initial};
      renderDraft();
      status.textContent = '已恢复默认背景。';
    }
  };
  applySaved();
})();
