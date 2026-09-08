// Remember creator discovery on GitHub Pages and carry it to the checkout host.
(() => {
  const key = 'yume_creator_visit_v1';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* storage optional */ }
  if (!saved || !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(saved.code) || !Number.isFinite(saved.expires) || saved.expires <= Date.now()) saved = null;
  const params = new URLSearchParams(location.search);
  const code = (params.get('ref') || '').toLowerCase();
  if (!saved && /^[a-z0-9][a-z0-9_-]{2,31}$/.test(code)) {
    saved = { code, video: (params.get('video') || '').slice(0, 100), expires: Date.now() + 90 * 86400000 };
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* still carry on this page */ }
  }
  if (!saved) return;
  const note = document.createElement('aside');
  note.setAttribute('aria-label', 'Creator referral');
  note.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:1000;background:#17121f;color:#eee;border:1px solid #78608d;border-radius:10px;padding:12px 16px;font:13px/1.5 system-ui;max-width:560px';
  const label = document.createElement('span');
  label.textContent = `Creator code: ${saved.code}. Enter it at checkout when you upgrade, in case you buy from a different browser. `;
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Dismiss';
  close.style.cssText = 'background:none;border:0;color:#dac2ff;text-decoration:underline;cursor:pointer';
  close.addEventListener('click', () => note.remove());
  note.append(label, close); document.body.append(note);
  // Capture also covers purchase links added after the release manifest loads.
  document.addEventListener('click', event => {
    const a = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!a || !saved || saved.expires <= Date.now()) return;
    const url = new URL(a.href, location.href);
    if (url.origin === 'https://yuru.be' && url.pathname.startsWith('/yume/pro')) {
      url.searchParams.set('ref', saved.code);
      if (saved.video) url.searchParams.set('video', saved.video);
      a.href = url.toString();
    }
  }, true);
})();
