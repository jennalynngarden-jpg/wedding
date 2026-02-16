/* ========================================
   Jenna & Liam Wedding Website
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  initCountdown();
  initMobileNav();
  initSmoothScroll();
});

/* ---------- Countdown Timer ---------- */
function initCountdown() {
  var weddingDate = new Date('2027-07-24T16:00:00-07:00');
  var countdownEl = document.getElementById('countdown');
  if (!countdownEl) return;

  function update() {
    var now = new Date();
    var diff = weddingDate - now;

    if (diff <= 0) {
      countdownEl.innerHTML = '<p class="countdown-message">Today is the day!</p>';
      return;
    }

    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.innerHTML =
      '<div class="countdown-item"><span class="countdown-number">' + days + '</span><span class="countdown-label">Days</span></div>' +
      '<div class="countdown-item"><span class="countdown-number">' + hours + '</span><span class="countdown-label">Hours</span></div>' +
      '<div class="countdown-item"><span class="countdown-number">' + minutes + '</span><span class="countdown-label">Minutes</span></div>' +
      '<div class="countdown-item"><span class="countdown-number">' + seconds + '</span><span class="countdown-label">Seconds</span></div>';
  }

  update();
  setInterval(update, 1000);
}

/* ---------- Mobile Nav Toggle ---------- */
function initMobileNav() {
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var isActive = links.classList.toggle('active');
    toggle.classList.toggle('active');
    toggle.setAttribute('aria-expanded', isActive);
  });

  var navAnchors = links.querySelectorAll('a');
  for (var i = 0; i < navAnchors.length; i++) {
    navAnchors[i].addEventListener('click', function () {
      links.classList.remove('active');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }
}

/* ---------- Smooth Scroll with Nav Offset ---------- */
function initSmoothScroll() {
  var anchors = document.querySelectorAll('a[href^="#"]');
  var nav = document.getElementById('main-nav');

  for (var i = 0; i < anchors.length; i++) {
    anchors[i].addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (href === '#') return;

      var target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        var navHeight = nav ? nav.offsetHeight : 0;
        var targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  }
}
