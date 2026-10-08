function __debugDims() {
  const ids = ['html', 'body', 'app', 'view', 'sidebar', 'topbar', 'bottombar'];
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id) || (id === 'html' ? document.documentElement : (id === 'body' ? document.body : null));
    if (el) out[id] = { w: el.offsetWidth, h: el.offsetHeight, l: el.offsetLeft, t: el.offsetTop, ml: el.style.marginLeft || '(auto)', pl: el.style.paddingLeft || '(auto)' };
  }
  const vp = document.querySelector('.vp-page'); if (vp) out['vp-page'] = { w: vp.offsetWidth, h: vp.offsetHeight, l: vp.offsetLeft, t: vp.offsetTop };
  const vs = document.querySelector('.vp-stage'); if (vs) out['vp-stage'] = { w: vs.offsetWidth, h: vs.offsetHeight, l: vs.offsetLeft, t: vs.offsetTop };
  const v = document.querySelector('.vp-stage video'); if (v) out['video'] = { w: v.offsetWidth, h: v.offsetHeight, l: v.offsetLeft, t: v.offsetTop, of: v.style.objectFit, op: v.style.objectPosition };
  out['bodyClasses'] = document.body.className;
  return JSON.stringify(out);
}
window.__debugDims = __debugDims;
if (window.RhinoBridge) { window.RhinoBridge.log('DIMS=' + __debugDims()); } else { console.log('DIMS=' + __debugDims()); }
