/* ============================================
   memory.js — Photo Memory Overlay
   Fullscreen surprise when tapping special places
   ============================================ */

const Memory = (() => {
  let isOpen = false;
  let closingTimer = null;
  let onCloseCallback = null;

  const dom = {};

  function cacheDom() {
    dom.overlay  = document.getElementById('memory-overlay');
    dom.backdrop = dom.overlay.querySelector('.memory-backdrop');
    dom.closeBtn = document.getElementById('memory-close');
    dom.photo    = document.getElementById('memory-photo');
    dom.text     = document.getElementById('memory-text');
    dom.hearts   = document.getElementById('memory-hearts');
    dom.stage    = dom.overlay.querySelector('.memory-stage');
  }

  function init() {
    cacheDom();
    dom.closeBtn.addEventListener('click', hide);
    dom.backdrop.addEventListener('click', hide);
    dom.stage.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) hide();
    });
  }

  function show(place, onClose) {
    if (isOpen) return;
    isOpen = true;
    onCloseCallback = onClose || null;
    clearTimeout(closingTimer);

    dom.photo.style.opacity = '0';
    dom.photo.src = (place.photos && place.photos.length > 0) ? place.photos[0] : '';
    dom.photo.onload = () => {
      dom.photo.style.opacity = '1';
    };
    dom.photo.onerror = () => {
      dom.photo.style.opacity = '1';
      dom.photo.style.background = 'linear-gradient(135deg, #fce4e4, #f8d0d0, #fce4e4)';
      dom.photo.style.minHeight = '300px';
    };

    dom.text.innerHTML = (place.memory || '这里藏着我们的回忆 💕')
      .replace(/\n/g, '<br>');

    dom.overlay.classList.remove('hidden', 'closing');
    dom.stage.classList.remove('closing');
    void dom.overlay.offsetWidth;
    dom.overlay.classList.add('active');

    setTimeout(spawnHearts, 600);
    document.body.style.overflow = 'hidden';
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false;

    dom.overlay.classList.add('closing');
    dom.stage.classList.add('closing');
    clearHearts();

    closingTimer = setTimeout(() => {
      dom.overlay.classList.remove('active');
      dom.overlay.classList.add('hidden');
      dom.stage.classList.remove('closing');
      dom.photo.src = '';
      document.body.style.overflow = '';
      if (onCloseCallback) {
        const cb = onCloseCallback;
        onCloseCallback = null;
        cb();
      }
    }, 400);
  }

  function spawnHearts() {
    clearHearts();
    const hearts = ['❤️', '💕', '💖', '💗', '💝', '✨', '🌸', '💐'];
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 20; i++) {
      const heart = document.createElement('span');
      heart.className = 'floating-heart';
      heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
      heart.style.left = Math.random() * 90 + '%';
      heart.style.bottom = '-30px';
      heart.style.fontSize = (14 + Math.random() * 28) + 'px';
      heart.style.animationDelay = Math.random() * 1.5 + 's';
      heart.style.animationDuration = (2.5 + Math.random() * 3) + 's';
      heart.style.opacity = (0.5 + Math.random() * 0.5);
      fragment.appendChild(heart);
    }
    dom.hearts.appendChild(fragment);
  }

  function clearHearts() {
    dom.hearts.innerHTML = '';
  }

  return { init, show, hide };
})();
