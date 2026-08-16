/**
 * ECharts 本地加载器：本地 vendor 加载完成后派发 echarts-ready 事件
 * （与原型代码监听方式一致：window.addEventListener('echarts-ready', ...)）
 */
window.addEventListener('load', function () {
  if (window.echarts) {
    window.dispatchEvent(new Event('echarts-ready'));
  }
});