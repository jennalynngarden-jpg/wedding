/* ========================================
   Jenna & Liam Wedding Website
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  initCountdown();
  initMobileNav();
  initCarousels();
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

    countdownEl.innerHTML =
      '<div class="countdown-item"><span class="countdown-number">' + days + '</span><span class="countdown-label">Days</span></div>' +
      '<div class="countdown-item"><span class="countdown-number">' + hours + '</span><span class="countdown-label">Hours</span></div>' +
      '<div class="countdown-item"><span class="countdown-number">' + minutes + '</span><span class="countdown-label">Minutes</span></div>';
  }

  update();
  setInterval(update, 60000);
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

/* ---------- Carousel ---------- */
function initCarousels() {
  var carousels = document.querySelectorAll('.carousel');
  for (var i = 0; i < carousels.length; i++) {
    setupCarousel(carousels[i]);
  }
}

function setupCarousel(carousel) {
  var track = carousel.querySelector('.carousel-track');
  var slides = carousel.querySelectorAll('.carousel-slide');
  var leftArrow = carousel.querySelector('.carousel-arrow--left');
  var rightArrow = carousel.querySelector('.carousel-arrow--right');
  var dotsContainer = carousel.querySelector('.carousel-dots');
  var currentIndex = 0;

  if (!track || slides.length === 0) return;

  // Create dots
  for (var i = 0; i < slides.length; i++) {
    var dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    dot.addEventListener('click', (function (index) {
      return function () { goToSlide(index); };
    })(i));
    dotsContainer.appendChild(dot);
  }

  var dots = dotsContainer.querySelectorAll('.carousel-dot');

  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    currentIndex = index;
    track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle('active', j === currentIndex);
    }
  }

  leftArrow.addEventListener('click', function () {
    goToSlide(currentIndex - 1);
  });

  rightArrow.addEventListener('click', function () {
    goToSlide(currentIndex + 1);
  });
}
