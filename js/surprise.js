/* ============================================
   surprise.js — Anniversary Easter Egg
   Petal rain + love card on special dates
   ============================================ */

const Surprise = (() => {
  const SPECIAL_DATES = [
    {
      month: 7, day: 3,
      message: '今天是我们见面第300天 💕\n\n300个日日夜夜\n从第一次见到你心跳加速\n到现在的每一天都因为你而发光\n\n遇见你\n是我这辈子最美好的意外\n\n往后的每一天\n我都要陪在你身边\n走过无数个300天\n\n我爱你 ✨',
    },
    {
      month: 3, day: 15,
      message: '今天是我们的纪念日 💕\n\n从樱花树下的第一眼\n到现在的每一天\n都是我最珍贵的回忆\n\n我爱你，比昨天更多\n比明天少一点 ✨',
    },
    {
      month: 2, day: 14,
      message: '情人节快乐！🌹\n\n虽然有时候我不太会表达\n但你知道吗\n你笑起来的时候\n整个世界都亮了\n\n永远爱你的我 💝',
    },
    {
      month: 8, day: 7,
      message: '七夕快乐！🎋\n\n牛郎织女一年只见一次\n而我每天都在想你\n\n你是这个星球上\n我最想共度余生的人 💕',
    },
  ];

  const STORAGE_KEY = 'whu_surprise_last_triggered';
  let petalTimer = null;

  function init() {
    var today = new Date();
    var month = today.getMonth() + 1;
    var day = today.getDate();
    var dateKey = today.getFullYear() + '-' + month + '-' + day;

    // Preview mode: add ?surprise to URL to preview the effect
    var isPreview = window.location.search.indexOf('surprise') !== -1;
    if (isPreview) {
      var match = SPECIAL_DATES[0]; // use the first (most recent) special date
      setTimeout(function() {
        startPetalRain();
        setTimeout(function() { showLoveCard(match.message); }, 2000);
      }, 800);
      return; // don't save to localStorage — won't affect tomorrow's real trigger
    }

    var lastTriggered = localStorage.getItem(STORAGE_KEY);
    if (lastTriggered === dateKey) return;

    var match = SPECIAL_DATES.find(function(d) { return d.month === month && d.day === day; });
    if (!match) return;

    localStorage.setItem(STORAGE_KEY, dateKey);

    setTimeout(function() {
      startPetalRain();
      setTimeout(function() { showLoveCard(match.message); }, 2000);
    }, 1500);
  }

  function startPetalRain() {
    const container = document.getElementById('petal-storm');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '';

    const petals = ['🌸', '💮', '🌺', '🌷', '💐', '🏵️', '✿', '🌼', '💖'];

    for (let i = 0; i < 35; i++) {
      const petal = document.createElement('span');
      petal.className = 'falling-petal';
      petal.textContent = petals[Math.floor(Math.random() * petals.length)];
      petal.style.left = Math.random() * 100 + '%';
      petal.style.fontSize = (16 + Math.random() * 30) + 'px';
      petal.style.animationDelay = Math.random() * 4 + 's';
      petal.style.animationDuration = (6 + Math.random() * 8) + 's';
      petal.style.opacity = (0.5 + Math.random() * 0.5);
      container.appendChild(petal);
    }

    petalTimer = setTimeout(() => {
      container.classList.add('hidden');
      container.innerHTML = '';
    }, 16000);
  }

  function showLoveCard(message) {
    const card = document.getElementById('surprise-card');
    const msg = document.getElementById('surprise-message');
    const dismissBtn = document.getElementById('surprise-dismiss');
    if (!card || !msg) return;

    msg.innerHTML = message.replace(/\n/g, '<br>');
    card.classList.remove('hidden');

    dismissBtn.onclick = () => {
      card.classList.add('hidden');
    };

    card.addEventListener('click', (e) => {
      if (e.target === card) card.classList.add('hidden');
    });
  }

  return { init };
})();
