/* ============================================
   love-counter.js — "We've been together for..."
   Live count-up timer, updates every second
   ============================================ */

const LoveCounter = (() => {
  const START_DATE = new Date('2025-08-08T13:16:00');

  let timer = null;
  let domText = null;

  function init() {
    domText = document.getElementById('love-counter-text');
    if (!domText) return;
    update();
    timer = setInterval(update, 1000);
  }

  function update() {
    const now = new Date();
    const diff = now - START_DATE;

    if (diff <= 0) {
      domText.textContent = '💕 我们的故事即将开始...';
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    domText.innerHTML =
      `💕 我们在一起已经 <strong>${days.toLocaleString()}</strong> 天 ` +
      `${pad(hours)} 时 ${pad(minutes)} 分 ${pad(seconds)} 秒 💕`;
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  return { init };
})();
