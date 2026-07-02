/* ============================================
   love-counter.js — Dual love counters
   见面 (meeting): 2025-09-06
   在一起 (together): 2025-08-07
   ============================================ */

const LoveCounter = (() => {
  const MEET_DATE = new Date('2025-09-06T00:00:00');    // 见面
  const TOGETHER_DATE = new Date(2025, 7, 8, 13, 16, 0); // 在一起: 2025.8.8 13:16

  let timer = null;
  let domMeet = null;
  let domTogether = null;

  function init() {
    domMeet = document.getElementById('love-meet-text');
    domTogether = document.getElementById('love-together-text');
    if (!domMeet && !domTogether) return;
    update();
    timer = setInterval(update, 1000);
  }

  function update() {
    var now = new Date();

    // Meeting counter
    if (domMeet) {
      var meetDiff = now - MEET_DATE;
      if (meetDiff <= 0) {
        domMeet.textContent = '我们的故事即将开始...';
      } else {
        domMeet.innerHTML = formatLine('见面', meetDiff);
      }
    }

    // Together counter
    if (domTogether) {
      var togetherDiff = now - TOGETHER_DATE;
      if (togetherDiff <= 0) {
        domTogether.textContent = '故事还没开始呢...';
      } else {
        domTogether.innerHTML = formatLine('在一起', togetherDiff);
      }
    }
  }

  function formatLine(label, diff) {
    var totalSeconds = Math.floor(diff / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    return label + '已经 <strong>' + days.toLocaleString() + '</strong> 天 ' +
      pad(hours) + ' 时 ' + pad(minutes) + ' 分 ' + pad(seconds) + ' 秒';
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  return { init };
})();
