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

  function goToSlide(index) {
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    currentIndex = index;
    track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
    for (var j = 0; j < dots.length; j++) {
      dots[j].classList.toggle('active', j === currentIndex);
    }
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
          img.src = photo.url;
          img.alt = photo.name ? 'Photo shared by ' + photo.name : 'Guest photo';
          img.loading = 'lazy';

          slide.appendChild(img);
          track.appendChild(slide);
        }

        // Mark carousel as having photos
        carousel.classList.add('has-photos');

        // Re-initialize this carousel with the new slides
        setupPhotoCarousel(carousel);
      }
    })
    .catch(function(error) {
      console.log('Could not load guest photos:', error);
      // Keep the empty message visible
    });
}
