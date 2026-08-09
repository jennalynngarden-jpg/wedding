/* ========================================
   Photos Page - Carousels & Guest Photos
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
  initPhotoCarousels();
  loadGuestPhotos();
});

/* ---------- Photo Carousels ---------- */
function initPhotoCarousels() {
  var carousels = document.querySelectorAll('.photo-carousel');
  for (var i = 0; i < carousels.length; i++) {
    setupPhotoCarousel(carousels[i]);
  }
}

function setupPhotoCarousel(carousel) {
  var track = carousel.querySelector('.photo-carousel-track');
  var container = carousel.querySelector('.photo-carousel-track-container');
  var slides = carousel.querySelectorAll('.photo-carousel-slide');
  var leftArrow = carousel.querySelector('.photo-carousel-arrow--left');
  var rightArrow = carousel.querySelector('.photo-carousel-arrow--right');
  var dotsContainer = carousel.querySelector('.photo-carousel-dots');
  var currentIndex = 0;

  // Don't initialize if no slides
  if (!track || slides.length === 0) return;

  // Create dots
  for (var i = 0; i < slides.length; i++) {
    var dot = document.createElement('button');
    dot.className = 'photo-carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Go to photo ' + (i + 1));
    dot.addEventListener('click', (function(index) {
      return function() { goToSlide(index); };
    })(i));
    dotsContainer.appendChild(dot);
  }

  var dots = dotsContainer.querySelectorAll('.photo-carousel-dot');

  // Mark the first slide as current so only it casts a shadow to start
  if (slides[0]) slides[0].classList.add('is-current');

  // Resize the frame to match the current photo's height, so spacing under the
  // heading stays consistent and the frame hugs each photo (height can "jump").
  function updateHeight() {
    var img = slides[currentIndex].querySelector('img');
    if (!img || !container) return;
    // Only set a height once the photo has actually loaded and has a real size.
    // (Measuring too early returns 0 and would collapse the frame.)
    if (img.offsetHeight > 0) {
      container.style.height = img.offsetHeight + 'px';
    }
  }

  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    currentIndex = index;
    track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle('active', j === currentIndex);
    }
    // Only the current slide casts a shadow, so neighbouring photos' shadows
    // can't bleed into view at the edges.
    for (var k = 0; k < slides.length; k++) {
      slides[k].classList.toggle('is-current', k === currentIndex);
    }
    updateHeight();
  }

  leftArrow.addEventListener('click', function() {
    goToSlide(currentIndex - 1);
  });

  rightArrow.addEventListener('click', function() {
    goToSlide(currentIndex + 1);
  });

  // Keyboard navigation
  carousel.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') goToSlide(currentIndex - 1);
    if (e.key === 'ArrowRight') goToSlide(currentIndex + 1);
  });

  // Set the starting height once images have dimensions, and keep it correct
  // if the window is resized or images finish loading later.
  updateHeight();
  window.addEventListener('resize', updateHeight);
  window.addEventListener('load', updateHeight);
  var imgs = carousel.querySelectorAll('.photo-carousel-slide img');
  for (var k = 0; k < imgs.length; k++) {
    // Re-measure whenever any photo finishes loading (covers cached and fresh).
    imgs[k].addEventListener('load', updateHeight);
    // If a photo is already loaded, measure on the next frame (after layout).
    if (imgs[k].complete) {
      requestAnimationFrame(updateHeight);
    }
  }
}

/* ---------- Guest Photos from Google Drive ---------- */
// This URL should point to your Google Apps Script web app
var GUEST_PHOTOS_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';

function loadGuestPhotos() {
  var carousel = document.getElementById('memories-carousel');
  var track = document.getElementById('memories-track');
  var dotsContainer = document.getElementById('memories-dots');
  var emptyMessage = document.getElementById('memories-empty');

  if (!carousel || !track) return;

  // Fetch photos from Google Apps Script
  fetch(GUEST_PHOTOS_URL + '?action=getPhotos')
    .then(function(response) { return response.json(); })
    .then(function(data) {
      if (data.photos && data.photos.length > 0) {
        // Clear track and dots
        track.innerHTML = '';
        dotsContainer.innerHTML = '';

        // Add photos to carousel
        for (var i = 0; i < data.photos.length; i++) {
          var photo = data.photos[i];
          var slide = document.createElement('div');
          slide.className = 'photo-carousel-slide';

          var img = document.createElement('img');
          // Build a reliable Google Drive image link from the file's ID.
          // (The older "uc?export=view" format often fails to load.)
          img.src = 'https://drive.google.com/thumbnail?id=' + photo.id + '&sz=w1600';
          // We don't capture the guest's name on upload, so use a generic label
          // rather than the raw filename (e.g. "benihana.jpg").
          img.alt = 'Photo shared by a wedding guest';
          img.loading = 'lazy';
          // If a photo still can't load, hide its slide instead of showing a broken icon.
          img.onerror = function() {
            var brokenSlide = this.parentNode;
            if (brokenSlide && brokenSlide.parentNode) {
              brokenSlide.parentNode.removeChild(brokenSlide);
            }
          };

          slide.appendChild(img);
          track.appendChild(slide);
        }

        // Mark carousel as having photos
        carousel.classList.add('has-photos');

        // Reveal the whole Memories section (hidden by default until now)
        var section = document.getElementById('memories-section');
        if (section) section.classList.add('has-photos');

        // Re-initialize this carousel with the new slides
        setupPhotoCarousel(carousel);
      }
    })
    .catch(function(error) {
      console.log('Could not load guest photos:', error);
      // Keep the empty message visible
    });
}
