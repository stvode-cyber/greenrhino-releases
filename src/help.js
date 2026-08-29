// help.js — 应用内「使用说明」面板
import { h, openModal } from './ui/dom.js'

// 使用说明正文（与仓库 HELP.md 保持一致）
const helpHtml = `
<div class="help-hero">
  <div class="help-hero-logo">🦏</div>
  <div>
    <div class="help-hero-title">绿角犀播放器</div>
    <div class="help-hero-sub">离线媒体播放器 · 你的音乐与视频，本地随行</div>
  </div>
</div>

<section class="help-sec">
  <h4>快速开始</h4>
  <ol class="help-steps">
    <li>点击左侧「<b>＋ 添加文件</b>」或「<b>📁 导入文件夹</b>」，选择本地音频 / 视频。</li>
    <li>文件以 Blob 存入浏览器本地数据库（IndexedDB），<b>不上传任何服务器</b>，离线也能播放。</li>
    <li>点击任意媒体卡片开始播放；音乐进入专辑页，视频进入播放页。</li>
  </ol>
</section>

<section class="help-sec">
  <h4>导入媒体</h4>
  <ul>
    <li><b>添加文件</b>：多选单个或多个文件。</li>
    <li><b>导入文件夹</b>：一次导入整个文件夹（含子目录）。</li>
    <li><b>拖拽导入</b>：把文件直接拖入媒体库区域即可加入。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>音乐播放</h4>
  <ul>
    <li>专辑封面 + 实时频谱 + 滚动歌词；<b>点击歌词</b>可跳到对应时间。</li>
    <li>进度条可拖动；含章节的音频会在进度条上显示<b>章节节点</b>，点击跳转。</li>
    <li>收藏：卡片右上角星标，收藏内容在「收藏」页统一管理。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>视频播放</h4>
  <ul>
    <li><b>字幕</b>：加载 <code>.srt</code> / <code>.vtt</code>，多字幕按文件名区分，可「关闭字幕」。</li>
    <li><b>音轨</b>：多音轨视频可切换（如原声 / 配音）。</li>
    <li><b>章节</b>：进度条显示章节节点，点击跳转。</li>
    <li><b>画中画</b>、<b>AB 循环</b>、<b>截图</b>、<b>旋转</b>、<b>画面比例</b>一键切换。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>播放控制</h4>
  <ul>
    <li>底栏：播放 / 暂停、上一首 / 下一首、进度、音量、播放模式。</li>
    <li><b>播放模式</b>：顺序、列表循环、随机、单曲循环（设置中切换，<b>重启后记住</b>）。</li>
    <li><b>队列</b>：点击底栏队列按钮打开抽屉，可拖拽排序、点击跳转、移除。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>音效与均衡器（EQ）</h4>
  <ul>
    <li>设置 → 均衡器：10 段 EQ，内置预设或自定义；开启<b>交叉淡入</b>让切歌更顺滑。</li>
    <li>可调节默认音量与播放速度。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>睡眠定时</h4>
  <p>打开睡眠定时：15 / 30 / 60 分钟，或「播完当前曲停止」。</p>
</section>

<section class="help-sec">
  <h4>续播</h4>
  <p>设置中开启「退出续播」，下次打开自动恢复到上次位置（暂停态），点击播放即续播。</p>
</section>

<section class="help-sec">
  <h4>安装到桌面 / 离线</h4>
  <ul>
    <li>浏览器支持时，侧边栏出现「<b>📲 安装应用</b>」按钮，一键安装为桌面 / 主屏应用。</li>
    <li>安装后即使<b>断网</b>也能完整使用（Service Worker 已缓存全部资源）。</li>
  </ul>
</section>

<section class="help-sec">
  <h4>电脑快捷键</h4>
  <table class="help-kbd">
    <thead><tr><th>按键</th><th>功能</th></tr></thead>
    <tbody>
      <tr><td><kbd>空格</kbd></td><td>播放 / 暂停</td></tr>
      <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>后退 / 前进 5 秒</td></tr>
      <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>提高 / 降低音量</td></tr>
      <tr><td><kbd>M</kbd></td><td>静音切换</td></tr>
      <tr><td><kbd>N</kbd> / <kbd>P</kbd></td><td>下一首 / 上一首</td></tr>
      <tr><td><kbd>F</kbd></td><td>视频全屏</td></tr>
    </tbody>
  </table>
</section>

<section class="help-sec">
  <h4>常见问题</h4>
  <ul>
    <li><b>文件显示「⚠ 文件已丢失」？</b> 原文件被移动或删除。点「重新定位」选回原文件，或「从库移除」。</li>
    <li><b>某格式无法播放？</b> 提示「该格式暂不支持」，会自动跳到下一首。</li>
    <li><b>存储空间不足？</b> 设置 → 存储管理：清理缩略图缓存；导入记录可单独移除。</li>
  </ul>
</section>
`

export function openHelp() {
  let close
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' },
      h('h3', {}, '绿角犀播放器 · 使用说明'),
      h('button', { class: 'icon-btn', onclick: () => close?.() }, '✕')
    ),
    h('div', { class: 'mb help-body', html: helpHtml })
  )
  close = openModal(modal)
}
