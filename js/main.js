/* ========================================
   Jenna & Liam Wedding Website
   ======================================== */

document.addEventListener('DOMContentLoaded', function () {
  initCountdown();
  initMobileNav();
  initCarousels();
  try { initStoryPhotoStrips(); } catch (e) { console.error('Story strips error:', e); }
  initFitGrids();
  initLightbox();
  initSpotImageRotation();
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

/* ---------- Nav Sidebar Toggle ---------- */
function initMobileNav() {
  var toggle = document.getElementById('nav-toggle');
  var links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  // Create overlay for closing sidebar by clicking outside
  var overlay = document.createElement('div');
  overlay.className = 'nav-overlay';
  document.body.appendChild(overlay);

  function openNav() {
    links.classList.add('active');
    toggle.classList.add('active');
    overlay.classList.add('active');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function closeNav() {
    links.classList.remove('active');
    toggle.classList.remove('active');
    overlay.classList.remove('active');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () {
    if (links.classList.contains('active')) {
      closeNav();
    } else {
      openNav();
    }
  });

  // Close when clicking overlay
  overlay.addEventListener('click', closeNav);

  // Close when clicking a nav link
  var navAnchors = links.querySelectorAll('a');
  for (var i = 0; i < navAnchors.length; i++) {
    navAnchors[i].addEventListener('click', closeNav);
  }

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && links.classList.contains('active')) {
      closeNav();
    }
  });

  // Close sidebar when resizing to desktop (above 1200px breakpoint)
  window.addEventListener('resize', function () {
    if (window.innerWidth > 1200 && links.classList.contains('active')) {
      closeNav();
    }
  });

  // Swipe up on the menu sheet to dismiss it (the sheet slides up to hide,
  // so an upward swipe is the natural gesture). Vertical swipe, past a small
  // threshold, and mostly vertical so it doesn't fire on stray movement.
  var navTouchStartY = 0, navTouchStartX = 0, navTouchActive = false;

  links.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    navTouchStartY = e.touches[0].clientY;
    navTouchStartX = e.touches[0].clientX;
    navTouchActive = true;
  }, { passive: true });

  links.addEventListener('touchend', function (e) {
    if (!navTouchActive) return;
    navTouchActive = false;
    var dy = e.changedTouches[0].clientY - navTouchStartY;
    var dx = e.changedTouches[0].clientX - navTouchStartX;
    if (dy < -50 && Math.abs(dy) > Math.abs(dx)) {
      closeNav();
    }
  }, { passive: true });
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

  // Touch swipe support (mobile) — swipe left/right to change slides.
  // We compare horizontal vs. vertical movement so up/down still scrolls the
  // page normally; only a mostly-horizontal swipe flips the slide.
  var touchStartX = 0, touchStartY = 0, touchActive = false;
  var swipeArea = carousel.querySelector('.carousel-track-container') || carousel;

  swipeArea.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchActive = true;
  }, { passive: true });

  swipeArea.addEventListener('touchend', function (e) {
    if (!touchActive) return;
    touchActive = false;
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    // 40px threshold, and horizontal must dominate vertical
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goToSlide(currentIndex + 1);
      else goToSlide(currentIndex - 1);
    }
  }, { passive: true });
}

/* ---------- Story Photo Strips ---------- */
/* Each .story-photos container has a horizontal row of images.
   On desktop, arrows scroll the strip left/right one photo at a time.
   On tablet/mobile, CSS makes the container touch-scrollable instead. */
function initStoryPhotoStrips() {
  var strips = document.querySelectorAll('.story-photos');
  for (var i = 0; i < strips.length; i++) {
    setupStoryStrip(strips[i]);
  }
}

function setupStoryStrip(container) {
  var trackContainer = container.querySelector('.story-photos-track-container');
  var track = container.querySelector('.story-photos-track');
  var images = track.querySelectorAll('img');
  var leftArrow = container.querySelector('.story-photos-arrow--left');
  var rightArrow = container.querySelector('.story-photos-arrow--right');
  var offset = 0; // current translateX offset in pixels

  if (images.length === 0) return;

  function getMaxOffset() {
    // How far the track can scroll: total track width minus visible wrapper width
    var visibleWidth = trackContainer ? trackContainer.clientWidth : container.clientWidth;
    return Math.max(0, track.scrollWidth - visibleWidth);
  }

  var imagesLoaded = false;

  function updateArrows() {
    var max = getMaxOffset();
    // Only disable arrows once images have actually loaded and we can measure them
    if (!imagesLoaded) {
      leftArrow.disabled = (offset <= 0);
      rightArrow.disabled = false; // keep right arrow enabled until we know the real width
    } else {
      leftArrow.disabled = (offset <= 0);
      rightArrow.disabled = (offset >= max);
    }
  }

  function scrollStrip(direction) {
    // Scroll by roughly one image width (use the first image as reference)
    var imgWidth = images[0].offsetWidth;
    var step = (imgWidth > 0 ? imgWidth : 200) + 12; // 12 ≈ gap; fallback if image not measured
    var max = getMaxOffset();
    offset = offset + (direction * step);
    // Clamp between 0 and max
    if (offset < 0) offset = 0;
    if (offset > max) offset = max;
    track.style.transform = 'translateX(-' + offset + 'px)';
    imagesLoaded = true; // if user is clicking arrows, images must be visible
    updateArrows();
  }

  leftArrow.addEventListener('click', function () { scrollStrip(-1); });
  rightArrow.addEventListener('click', function () { scrollStrip(1); });

  // Set initial arrow state
  updateArrows();
  // Re-check once images finish loading (they may change track width)
  var loadedCount = 0;
  for (var i = 0; i < images.length; i++) {
    images[i].addEventListener('load', function () {
      loadedCount++;
      if (loadedCount >= images.length) imagesLoaded = true;
      updateArrows();
    });
    // If image was already cached, the load event won't fire
    if (images[i].complete) {
      loadedCount++;
    }
  }
  if (loadedCount >= images.length) imagesLoaded = true;
  updateArrows();

  // Fallback: re-check after a short delay for any timing issues
  setTimeout(function () {
    imagesLoaded = true;
    updateArrows();
  }, 800);

  // Also re-check on window resize
  window.addEventListener('resize', function () {
    var max = getMaxOffset();
    if (offset > max) {
      offset = max;
      track.style.transform = 'translateX(-' + offset + 'px)';
    }
    updateArrows();
  });
}

/* ---------- Fit Grids ---------- */
/* For photo grids with mixed aspect ratios (e.g. portrait + landscape),
   set each image's flex-grow to its natural aspect ratio so they fill
   the full row width without cropping anyone out. */
function initFitGrids() {
  var grids = document.querySelectorAll('.story-photos-grid--fit');
  for (var g = 0; g < grids.length; g++) {
    var imgs = grids[g].querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      (function (img) {
        function applyRatio() {
          if (img.naturalWidth && img.naturalHeight) {
            var ratio = img.naturalWidth / img.naturalHeight;
            img.style.flexGrow = ratio;
          }
        }
        if (img.complete) { applyRatio(); }
        img.addEventListener('load', applyRatio);
      })(imgs[i]);
    }
  }
}

/* ---------- Photo Lightbox ---------- */
/* Opens a full-screen viewer when clicking any story photo.
   Navigate with prev/next arrows or keyboard left/right.
   Close with X button, Escape key, or clicking the dark background. */
function initLightbox() {
  var overlay = document.getElementById('lightbox-overlay');
  if (!overlay) return;

  var img = document.getElementById('lightbox-img');
  var caption = document.getElementById('lightbox-caption');
  var closeBtn = document.getElementById('lightbox-close');
  var prevBtn = document.getElementById('lightbox-prev');
  var nextBtn = document.getElementById('lightbox-next');

  // All story photos grouped by their parent strip
  var currentGroup = [];
  var currentIndex = 0;

  function open(groupImages, index) {
    currentGroup = groupImages;
    currentIndex = index;
    show();
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function show() {
    var src = currentGroup[currentIndex].src;
    var cap = currentGroup[currentIndex].getAttribute('data-caption') || '';
    img.src = src;
    img.alt = currentGroup[currentIndex].alt || '';
    caption.textContent = cap;
    // Show/hide caption if it's just a placeholder
    caption.style.display = cap && cap !== '[caption goes here]' ? 'block' : 'none';
    // Show/hide arrows
    prevBtn.style.display = currentGroup.length > 1 ? 'block' : 'none';
    nextBtn.style.display = currentGroup.length > 1 ? 'block' : 'none';
  }

  function next() {
    currentIndex = (currentIndex + 1) % currentGroup.length;
    show();
  }

  function prev() {
    currentIndex = (currentIndex - 1 + currentGroup.length) % currentGroup.length;
    show();
  }

  // Open the lightbox when any eligible photo is clicked. Uses event
  // delegation so photos added later (e.g. guest "Memories") work too.
  document.addEventListener('click', function (e) {
    var photo = e.target.closest(
      '.story-photos-track img, .story-photos-grid img, .photo-carousel-slide img'
    );
    if (!photo) return;
    // Group the photos in the same strip / grid / carousel so prev/next works
    var container = photo.closest('.story-photos') ||
                    photo.closest('.story-photos-grid') ||
                    photo.closest('.photo-carousel');
    if (!container) return;
    var groupImages = container.querySelectorAll('img');
    var index = 0;
    for (var j = 0; j < groupImages.length; j++) {
      if (groupImages[j] === photo) { index = j; break; }
    }
    open(groupImages, index);
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);

  // Close when clicking the dark background (not the image itself)
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  // Keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (overlay.style.display === 'none') return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });
}

/* ---------- Spot Card Image Rotation ---------- */
/* For "things to do" cards that have multiple photos,
   this rotates between them with a crossfade every 60 seconds.

   How it works:
   1. Finds every <img> with a data-images attribute
   2. Creates a hidden overlay <img> on top of each one
   3. Every 60s, fades in the overlay with the next photo,
      then swaps it into the base image and hides the overlay

   To add rotation to a new card, just add a data-images
   attribute to its <img> tag with comma-separated paths. */

function initSpotImageRotation() {
  // Find all images that have multiple photos listed
  var images = document.querySelectorAll('.spot-card-img img[data-images]');

  for (var i = 0; i < images.length; i++) {
    setupImageRotation(images[i]);
  }
}

function setupImageRotation(baseImg) {
  // Parse the comma-separated list of image paths
  var imageList = baseImg.getAttribute('data-images').split(',');

  // No rotation needed if there's only one image
  if (imageList.length < 2) return;

  // Track which image is currently showing
  var currentIndex = 0;

  // Create the overlay image element for crossfading
  var overlay = document.createElement('img');
  overlay.className = 'fade-overlay';
  overlay.alt = baseImg.alt;

  // Insert the overlay into the same container
  baseImg.parentNode.appendChild(overlay);

  // Rotate to the next image every 60 seconds
  setInterval(function () {
    // Move to the next image in the list
    currentIndex = (currentIndex + 1) % imageList.length;

    // Set the overlay's source to the next image
    overlay.src = imageList[currentIndex];

    // Once the overlay image has loaded, fade it in
    overlay.onload = function () {
      overlay.classList.add('active');

      // After the fade finishes (1 second), swap the base
      // image and hide the overlay so it's ready for next time
      setTimeout(function () {
        baseImg.src = imageList[currentIndex];
        overlay.classList.remove('active');
      }, 1050);
    };
  }, 60000);
}
