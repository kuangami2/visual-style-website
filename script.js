(() => {
  const body = document.body;
  const themeToggle = document.querySelector('#theme-toggle');
  const savedTheme = localStorage.getItem('visual-lab-theme');
  if (savedTheme === 'dark') body.classList.add('dark');
  themeToggle?.addEventListener('click', () => {
    body.classList.toggle('dark');
    localStorage.setItem('visual-lab-theme', body.classList.contains('dark') ? 'dark' : 'light');
  });

  const cards = [...document.querySelectorAll('.style-card')];
  const chips = [...document.querySelectorAll('.filter-chip')];
  const count = document.querySelector('#visible-count');
  const empty = document.querySelector('#empty-state');
  chips.forEach((chip) => chip.addEventListener('click', () => {
    chips.forEach((item) => item.classList.remove('is-active'));
    chip.classList.add('is-active');
    const filter = chip.dataset.filter;
    let visible = 0;
    cards.forEach((card) => {
      const show = filter === 'all' || card.dataset.category.split(' ').includes(filter);
      card.classList.toggle('is-hidden', !show);
      if (show) visible += 1;
    });
    if (count) count.textContent = String(visible).padStart(2, '0');
    if (empty) empty.hidden = visible > 0;
  }));

  const dialog = document.querySelector('#prompt-dialog');
  const dialogTitle = document.querySelector('#dialog-title');
  const promptText = document.querySelector('#prompt-text');
  const promptMap = {
    'uv_run 事件环': 'visual systems diagram of libuv uv_run event loop, poll prepare check idle phases orbiting a central loop, glowing traces and precise nodes, charcoal, electric orange and warm ivory, editorial technical illustration, no text',
    '调用图折线': 'abstract call graph visualization for C functions, branching control flow and converging paths, crisp luminous lines over graphite grid, restrained red and cyan accents, high-end technical editorial, no text',
    '异步回调链': 'layered asynchronous callback chain, queue nodes connected across time, translucent stacked planes, deep blue and amber signal pulses, precise systems visualization, no text',
    '宏展开差异': 'before and after macro expansion shown as two aligned code layers, highlighted differences, paper and translucent acetate, warm light and graphite, technical editorial still life, no readable text',
    'Redis 事件驱动': 'Redis ae event loop visualization, file events and time events feeding aeProcessEvents, luminous red pulses in a dark system map, precise editorial technology illustration, no text',
    '跨层路径': 'cross-layer trace from operating system call to libuv and Redis event callback, stacked architectural layers and a single bright path, ivory, graphite and vermilion, no text',
  };
  document.querySelectorAll('.card-expand').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const card = button.closest('.style-card');
    const title = card?.dataset.title || '视觉方向';
    if (dialogTitle) dialogTitle.textContent = title;
    if (promptText) promptText.textContent = promptMap[title] || promptMap['uv_run 事件环'];
    dialog?.showModal();
  }));
  document.querySelector('.dialog-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelector('#copy-prompt')?.addEventListener('click', async () => {
    const status = document.querySelector('#copy-status');
    try { await navigator.clipboard.writeText(promptText.textContent); if (status) status.textContent = '已复制'; }
    catch { if (status) status.textContent = '请手动选择复制'; }
    window.setTimeout(() => { if (status) status.textContent = ''; }, 1800);
  });

  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
})();
