document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
        var tb = document.getElementById('topbar');
        if(tb){
            // 🔴 把 topbar 染成亮红！
            tb.style.cssText = 'display:flex !important;background:#ff0000 !important;color:#fff !important;position:relative !important;z-index:99999 !important;border:4px solid #ffff00 !important;';
            // dump bounding rect
            var r = tb.getBoundingClientRect();
            var t = document.createElement('div');
            t.id = '__gr_tb_test';
            t.textContent = 'TOPBAR_RECT: top=' + r.top + ' left=' + r.left + ' w=' + r.width + ' h=' + r.height + ' zindex=' + getComputedStyle(tb).zIndex;
            t.style.cssText = 'position:fixed;top:40px;left:8px;z-index:99999;background:#00ff00;color:#000;padding:4px 8px;font-size:12px;font-family:monospace;border:2px solid #000;';
            document.body.appendChild(t);
        }
    }, 2500);
});
