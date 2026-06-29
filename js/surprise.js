/* ============================================
   surprise.js — Anniversary Easter Egg
   Petal rain + love card on special dates
   ============================================ */

const Surprise = (() => {
  const SPECIAL_DATES = [
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
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const dateKey = `${today.getFullYear()}-${month}-${day}`;

    const lastTriggered = localStorage.getItem(STORAGE_KEY);
    if (lastTriggered === dateKey) return;

    const match = SPECIAL_DATES.find(d => d.month === month && d.day === day);
    if (!match) return;

    localStorage.setItem(STORAGE_KEY, dateKey);

    setTimeout(() => {
      startPetalRain();
      setTimeout(() => showLoveCard(match.message), 2000);
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
