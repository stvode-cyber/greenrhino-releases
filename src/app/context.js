// src/app/context.js — 主应用共享上下文
// 🔶 大重构基础设施：解决 main.js 闭包耦合，让子模块能访问主作用域变量
export const ctx = {
  app: null,           // 主应用控制器
  pages: null,         // 已构建的页面字典
  ROLE: null,          // 'hub' | 'music' | 'video'
  isHub: false,
  isMusic: false,
  isVideo: false,
  importOverlay: null, // 导入进度浮层
  sidebar: null,
  musicNav: null,
  videoNav: null,
  installBtn: null,
  showPage: null,      // 路由函数（L502 定义后赋值）
}
