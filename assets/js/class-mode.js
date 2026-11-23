(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const live = $('classLive'), quiet = $('classQuiet'), preview = $('classPreview');
  const quietStudy = $('classQuietStudy'), quietCustom = $('classQuietCustom');
  const lead = $('classLead'), duration = $('classDuration');
  let state, generation = 0, busy = false, timer;

  for (const details of document.querySelectorAll('.class-disclosure')) {
    const summary = details.querySelector('summary'), content = details.querySelector('.class-disclosure-body');
    let animation, open = details.open;
    summary.addEventListener('click', event => {
      if (!animation && (!content.animate || matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      event.preventDefault();
      if (!animation) open = details.open;
      const from = details.open ? content.getBoundingClientRect().height : 0;
      const opacity = details.open ? getComputedStyle(content).opacity : 0;
      animation?.cancel();
      open = !open;
      details.open = true;
      content.inert = !open;
      details.classList.toggle('is-collapsing', !open);
      content.classList.add('is-expanding');
      const motion = animation = content.animate(
        [{height:from+'px',opacity},{height:(open ? content.scrollHeight : 0)+'px',opacity:open ? 1 : 0}],
        {duration:300,easing:'cubic-bezier(.24,.72,.28,1)',fill:'both'}
      );
      motion.finished.then(() => {
        if (animation !== motion) return;
        details.open = open;
        content.inert = false;
        content.classList.remove('is-expanding');
        details.classList.remove('is-collapsing');
        motion.cancel();
        animation = null;
      }, () => {});
    });
  }

  function render() {
    const needsColorOsPromotion = state.colorOsCard && !state.promoted;
    live.checked = !!state.live;
    $('classLiveDescription').textContent = state.displayMode === 'start' && state.leadMinutes === 0
      ? '「到上课」需设置提前时间。' : '在状态栏显示课程简称与教室';
    quiet.checked = !!state.quiet;
    quietStudy.checked = state.quietStudy !== false;
    quietStudy.disabled = busy;
    quietCustom.checked = state.quietCustom === true;
    quietCustom.disabled = busy;
    $('classQuietCustomRow').classList.toggle('hidden', !state.quiet || !state.quietSupported);
    $('classQuietStudyRow').classList.toggle('hidden', !state.quiet || !state.quietSupported);
    live.disabled = busy || !state.liveSupported || (!state.live && (!state.notifications || needsColorOsPromotion));
    quiet.disabled = busy || !state.quietSupported || (!state.quiet && (!state.quietAccess || !state.exact));
    $('classNotifications').hidden = !state.liveSupported || state.notifications;
    $('classPromotion').hidden = !state.liveSupported || !state.notifications || state.vivoCard
      || state.promotionSupported === false || (state.promoted && !state.xiaomiCard && !state.colorOsCard);
    $('classPromotion').textContent = state.colorOsCard ? '流体云设置' : '实时更新设置';
    $('classXiaomiNotifications').hidden = !state.xiaomiCard;
    $('classQuietAccess').hidden = !state.quietSupported || state.quietAccess;
    $('classAlarmAccess').hidden = !state.quietSupported || !state.quietAccess || state.exact;
    $('classRule').hidden = !state.quietAccess;
    preview.hidden = !state.liveSupported || !state.notifications || (needsColorOsPromotion && !state.preview);
    preview.disabled = busy;
    preview.textContent = state.preview ? '结束演示' : '试发 2 分钟';
    $('classCardOptions').hidden = !state.liveSupported;
    document.querySelectorAll('[name=classDensity]').forEach(input => {
      input.checked = input.value === (state.density || 'compact');
      input.disabled = busy;
    });
    document.querySelectorAll('[name=classDisplay]').forEach(input => {
      input.checked = input.value === (state.displayMode || 'end');
      input.disabled = busy;
    });
    duration.form.hidden = state.displayMode !== 'custom';
    for (const [input, value] of [[lead, state.leadMinutes ?? 10], [duration, state.displayMinutes ?? 1]]) {
      if (document.activeElement !== input) input.value = value;
      input.form.querySelector('button').disabled = busy;
    }
    $('classLiveStatus').textContent = !state.liveSupported ? (state.colorOsCard
      ? '流体云适配需要 Android 16 及以上。' : '此设备不支持课程实时卡片。')
      : !state.notifications ? '请先允许禾序发送通知。'
      : needsColorOsPromotion ? '请在流体云设置中允许禾序显示实时活动。'
      : state.preview && state.presentation === 'atomic' ? '已收到系统原子通知，可回桌面查看状态栏。'
      : state.preview && state.presentation === 'promoted' ? '系统已接收实时更新，可回桌面查看状态栏。'
      : state.preview && state.presentation === 'notification' ? (state.vivoCard
        ? '系统只显示了普通通知，本次未上原子岛。'
        : state.xiaomiCard ? '试发已送达。若未上岛，请检查系统中的悬浮通知和实时更新。'
        : state.colorOsCard ? '系统已收到试发通知，流体云尚未确认显示。'
        : '演示已发出，可下拉通知栏查看。')
      : state.preview ? '等待系统显示演示卡片。'
      : !state.live ? '课程上岛已关闭。'
      : state.vivoCard && state.vivoScene === 'disabled' ? '场景查询返回关闭，点击试发可查看系统实际展示结果。'
      : state.vivoCard && state.vivoScene === 'enabled' ? '系统已开启原子通知场景，可试发查看原子岛。'
      : state.vivoCard ? '此系统未返回原子通知场景状态，可试发查看实际效果。'
      : state.xiaomiCard ? '可试发检查超级岛。'
      : state.colorOsCard ? '可试发检查流体云。'
      : '支持 Android 实时更新的系统可显示胶囊，具体样式由系统决定。';
    $('classQuietStatus').textContent = !state.quietSupported ? '此功能需要 Android 10 或以上。'
      : !state.quietAccess ? '请在系统设置中允许禾序访问免打扰。'
      : !state.exact ? '需要「闹钟与提醒」权限，才能按上下课时间切换。'
      : state.quiet && !state.quietRuleReady ? '系统规则已停用或移除，请在系统中检查，或关闭后重新开启。'
      : state.quietActive ? '禾序免打扰已生效，预计 '+new Date(state.quietUntil).toLocaleTimeString('zh-CN',
        {hour:'2-digit',minute:'2-digit',timeZone:'Asia/Shanghai'})+' 结束。'
      : state.quiet && state.quietUntil > Date.now() ? '已向系统提交规则，正在等待生效。可在「系统规则」查看。'
      : state.quiet ? '等待下一项启用免打扰的安排。'
      : '';
    clearTimeout(timer);
    if ((state.preview || state.quiet) && visible())
      timer = setTimeout(refresh, state.preview && state.presentation === 'none' ? 1500 : state.quietUntil > Date.now()&&!state.quietActive ? 1500 : 12_000);
  }

  const visible = () => document.body.dataset.page === 'schedulePreferences';
  async function request(options) {
    const response = await fetch('/api/schedule/class-mode', options);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.msg || '暂时无法读取上课自动化设置');
    return result;
  }

  async function refresh() {
    if (!visible() || busy) return;
    const token = ++generation;
    try {
      const result = await request();
      if (token !== generation) return;
      state = result;
      render();
    } catch (error) {
      if (token === generation) $('classLiveStatus').textContent = error.message;
    }
  }

  async function change(feature, value) {
    if (busy || !state) return;
    busy = true;
    generation++;
    render();
    try {
      state = await request({
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(feature === 'display' ? {feature, ...value}
          : typeof value === 'boolean' ? {feature, enabled:value} : {feature, value})
      });
    } catch (error) {
      window.Jxau.toast(error.message);
    } finally {
      busy = false;
      render();
    }
  }

  live.addEventListener('change', () => change('live', live.checked));
  quiet.addEventListener('change', () => change('quiet', quiet.checked));
  quietStudy.addEventListener('change', () => change('quietStudy', quietStudy.checked));
  quietCustom.addEventListener('change', () => change('quietCustom', quietCustom.checked));
  preview.addEventListener('click', () => change('preview', !state.preview));
  document.querySelectorAll('[name=classDensity]').forEach(input => {
    input.addEventListener('change', () => change('density', input.value));
  });
  document.querySelectorAll('[name=classDisplay]').forEach(input => {
    input.addEventListener('change', () => change('display', {mode:input.value, minutes:state.displayMinutes ?? 1}));
  });
  lead.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state || busy || !lead.checkValidity()) return;
    await change('lead', lead.valueAsNumber);
    lead.value = state.leadMinutes ?? 10;
  });
  duration.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!state || busy || !duration.checkValidity()) return;
    await change('display', {mode:'custom', minutes:duration.valueAsNumber});
    duration.value = state.displayMinutes ?? 1;
  });
  addEventListener('jxau:route', refresh);
  addEventListener('jxau:foreground', refresh);
  addEventListener('jxau:agenda-synced', refresh);
})();
