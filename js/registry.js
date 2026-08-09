/* ========================================
   Registry Page
   - Loads items from the Google Sheet (via Apps Script)
   - Tap a card (gift or cause) to open a detail view
   - Gifts: mark as purchased (records name/email/note) and lock as Reserved
   - Causes: link out to the Every.org fundraiser
   ======================================== */

(function () {
  // Same Apps Script web app as the RSVP + photos features
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';

  var grid = document.getElementById('registry-grid');
  var statusEl = document.getElementById('registry-status');

  // Detail modal (the "product page")
  var detailModal = document.getElementById('registry-detail-modal');
  var detailImgwrap = document.getElementById('detail-imgwrap');
  var detailImg = document.getElementById('detail-img');
  var detailName = document.getElementById('detail-name');
  var detailPrice = document.getElementById('detail-price');
  var detailDesc = document.getElementById('detail-desc');
  var detailAboutLabel = document.getElementById('detail-about-label');
  var detailWhyLabel = document.getElementById('detail-why-label');
  var detailWhy = document.getElementById('detail-why');
  var detailGallery = document.getElementById('detail-gallery');
  var detailActions = document.getElementById('detail-actions');

  // Purchase modal (name/note form)
  var modal = document.getElementById('registry-modal');
  var modalTitle = document.getElementById('registry-modal-title');
  var modalError = document.getElementById('registry-modal-error');
  var nameInput = document.getElementById('buyer-name');
  var noteInput = document.getElementById('buyer-note');
  var confirmBtn = document.getElementById('registry-confirm');

  // Donation-record modal
  var donationModal = document.getElementById('donation-modal');
  var donationTitle = document.getElementById('donation-title');
  var donationHelp = document.getElementById('donation-help');
  var activeDonationLabel = 'Record donation';  // reset target for the confirm button

  // Payment method chooser (Venmo or Zelle) for gifts that come straight to us
  var paymentModal = document.getElementById('payment-modal');
  var paymentTitle = document.getElementById('payment-title');
  var paymentHelp = document.getElementById('payment-help');
  var paymentVenmoLink = document.getElementById('payment-venmo-link');
  var paymentRecordBtn = document.getElementById('payment-record-btn');
  var activePaymentItem = null;   // the fund/cause being sent money
  var donationError = document.getElementById('donation-error');
  var donorName = document.getElementById('donor-name');
  var donorAmount = document.getElementById('donor-amount');
  var donorNote = document.getElementById('donor-note');
  var donationConfirm = document.getElementById('donation-confirm');
  var activeCharity = null;

  if (!grid) return;

  var activeItemId = null;   // item being purchased (in the purchase modal)
  var itemsById = {};        // loaded registry items, keyed by id

  document.addEventListener('DOMContentLoaded', function () {
    // The fund card is added once the registry finishes loading (so the
    // loading animation can sit centered on its own).
    loadRegistry();
    wireCauseCards();
    wireModals();
  });

  function addFundCard() {
    var card = buildFundCard();
    card.classList.add('registry-item--in');
    grid.appendChild(card);
  }

  /* ---------- Honeymoon fund (always the first card in the grid) ---------- */
  var HONEYMOON_FUND = {
    name: 'Honeymoon Fund',
    description: "Jenna and Liam aren't sure where they’ll go on their honeymoon and " +
      "probably won't take it right away, but they’re setting aside some funds for it. " +
      'If you have destination suggestions or travel advice, feel free to send it along!',
    link: 'https://venmo.com/u/jennagarden',
    image: 'images/oak-crest.png',
    isCause: true,
    isFund: true,   // a gift/contribution, not a charity "donation"
    cta: 'Contribute'
  };

  function buildFundCard() {
    var card = document.createElement('div');
    card.className = 'registry-item';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML =
      '<div class="registry-item-imgwrap registry-item-imgwrap--logo">' +
        '<img src="' + HONEYMOON_FUND.image + '" alt="" class="registry-item-img">' +
      '</div>' +
      '<div class="registry-item-body">' +
        '<h3 class="registry-item-name">' + esc(HONEYMOON_FUND.name) + '</h3>' +
        '<p class="registry-item-desc">' + esc(HONEYMOON_FUND.description) + '</p>' +
        '<div class="registry-item-actions"><span class="registry-view-hint">Contribute</span></div>' +
      '</div>';

    function openIt() { openDetail(HONEYMOON_FUND); }
    card.addEventListener('click', openIt);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openIt();
      }
    });
    return card;
  }

  /* ---------- Load & render gift items ---------- */

  // Fetch JSON with automatic retries — Google Apps Script can be slow to
  // "wake up" (especially while fetching product metadata), and one dropped
  // request shouldn't show an error to guests.
  function fetchJSON(url, retries) {
    if (retries == null) retries = 2;
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function (err) {
        if (retries > 0) {
          return new Promise(function (resolve) { setTimeout(resolve, 900); })
            .then(function () { return fetchJSON(url, retries - 1); });
        }
        throw err;
      });
  }

  // The same floral line-art loader used on the RSVP form: a flower that
  // draws itself and loops while the registry loads.
  function floralLoaderHTML(caption) {
    return '<div class="floral-loader" role="status" aria-live="polite">' +
      '<svg viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g transform="translate(50,40)">' +
          '<path pathLength="1" d="M0,16 C0,34 0,50 0,64"/>' +
          '<path pathLength="1" d="M0,44 C10,37 18,43 16,52 C9,54 2,50 0,46"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(0)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(72)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(144)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(216)"/>' +
          '<ellipse pathLength="1" cx="0" cy="-15" rx="6.5" ry="15" transform="rotate(288)"/>' +
          '<circle pathLength="1" cx="0" cy="0" r="4.5"/>' +
        '</g>' +
      '</svg>' +
      '<p class="search-loading">' + caption + '</p>' +
    '</div>';
  }

  function loadRegistry() {
    statusEl.style.display = '';
    statusEl.innerHTML = floralLoaderHTML('Loading our registry&hellip;');
    fetchJSON(APPS_SCRIPT_URL + '?action=getRegistry')
      .then(function (data) {
        var items = data.items || [];
        statusEl.style.display = 'none';
        // Fund card first, then the gift items — all animate in together
        addFundCard();
        for (var i = 0; i < items.length; i++) {
          // Only accept real web addresses for images (e.g. an image inserted
          // directly into a sheet cell arrives as the text "CellImage")
          if (!/^https?:\/\//i.test(items[i].image || '')) {
            items[i].image = '';
          }
          itemsById[items[i].id] = items[i];
          var card = buildCard(items[i]);
          card.classList.add('registry-item--in');
          card.style.animationDelay = ((i + 1) * 0.07) + 's';
          grid.appendChild(card);
        }
      })
      .catch(function () {
        // Even if the gift list fails, still show the fund card (it's local)
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        addFundCard();
      });
  }

  // A card shows the image, name, price, and a short description. The whole
  // card is tappable and opens the detail view (like a shop product tile).
  function buildCard(item) {
    var card = document.createElement('div');
    card.className = 'registry-item' + (item.reserved ? ' is-reserved' : '');
    card.setAttribute('data-id', item.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    var imageHtml = item.image
      ? '<div class="registry-item-imgwrap">' +
          '<img class="registry-item-img" src="' + esc(item.image) + '" alt="' + esc(item.name) + '" loading="lazy">' +
        '</div>'
      : '<div class="registry-item-imgwrap registry-item-imgwrap--empty">' +
          '<img src="images/oak-leaf-favicon.png" alt="" class="registry-item-noimg">' +
        '</div>';

    var priceHtml = item.price
      ? '<p class="registry-item-price">' + esc(item.price) + '</p>' : '';

    var tagHtml = item.reserved
      ? '<span class="registry-reserved-badge">Reserved</span>'
      : '<span class="registry-view-hint">View details</span>';

    card.innerHTML =
      imageHtml +
      '<div class="registry-item-body">' +
        '<h3 class="registry-item-name">' + esc(item.name) + '</h3>' +
        priceHtml +
        '<p class="registry-item-desc">' + esc(item.description) + '</p>' +
        '<div class="registry-item-actions">' + tagHtml + '</div>' +
      '</div>';

    card.addEventListener('click', function () { openItemDetail(item.id); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openItemDetail(item.id);
      }
    });

    // If the image URL fails to load, fall back to the leaf placeholder
    // instead of showing a broken-image icon
    var img = card.querySelector('.registry-item-img');
    if (img) {
      img.addEventListener('error', function () {
        if (itemsById[item.id]) itemsById[item.id].image = '';
        var wrap = card.querySelector('.registry-item-imgwrap');
        if (wrap) {
          wrap.className = 'registry-item-imgwrap registry-item-imgwrap--empty';
          wrap.innerHTML = '<img src="images/oak-leaf-favicon.png" alt="" class="registry-item-noimg">';
        }
      });
    }

    return card;
  }

  /* ---------- Cause cards (static HTML) ---------- */
  function wireCauseCards() {
    var causes = document.querySelectorAll('.registry-item--cause');
    for (var i = 0; i < causes.length; i++) {
      (function (card) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        function openIt() {
          openDetail({
            name: card.getAttribute('data-name') || '',
            description: card.getAttribute('data-desc') || '',
            // Personal note shown as its own "Why it matters to us" section
            why: card.getAttribute('data-why') || '',
            link: card.getAttribute('data-link') || '',
            image: card.getAttribute('data-image') || '',
            // Optional extra photos shown as a gallery in the detail view
            gallery: (card.getAttribute('data-gallery') || '')
              .split(',').map(function (s) { return s.trim(); }).filter(Boolean),
            // Optional gallery layout, e.g. "scatter" for an angled, overlapping pile
            galleryStyle: card.getAttribute('data-gallery-style') || '',
            // Optional per-card button label (e.g. "Contribute on Every.org"
            // vs. a charity's own donate page)
            cta: card.getAttribute('data-cta') || 'Contribute',
            imageFit: card.getAttribute('data-image-fit') || '',
            isCause: true
          });
        }
        card.addEventListener('click', openIt);
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openIt();
          }
        });
      })(causes[i]);
    }

    wireCausesCarousel();
  }

  /* ---------- Causes carousel arrows ---------- */
  function wireCausesCarousel() {
    var track = document.getElementById('causes-grid');
    var prev = document.getElementById('causes-prev');
    var next = document.getElementById('causes-next');
    if (!track || !prev || !next) return;

    function scrollByCard(dir) {
      var card = track.querySelector('.registry-item');
      var step = card ? card.offsetWidth + 28 : track.clientWidth * 0.8; // 28 ≈ gap
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    }

    // Show/hide each arrow based on whether there's more to scroll that way
    function updateArrows() {
      var maxScroll = track.scrollWidth - track.clientWidth - 1;
      prev.hidden = track.scrollLeft <= 0;
      next.hidden = track.scrollLeft >= maxScroll;
    }

    prev.addEventListener('click', function () { scrollByCard(-1); });
    next.addEventListener('click', function () { scrollByCard(1); });
    track.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);
    updateArrows();
  }

  /* ---------- Detail modal ---------- */
  function openItemDetail(itemId) {
    var item = itemsById[itemId];
    if (item) openDetail(item);
  }

  function openDetail(item) {
    detailName.textContent = item.name;
    detailDesc.textContent = item.description;

    // Two labeled sections ("About" / "Why it matters to us") when a personal
    // note exists; otherwise just the plain description.
    var hasWhy = !!item.why;
    detailAboutLabel.style.display = hasWhy ? '' : 'none';
    detailWhyLabel.style.display = hasWhy ? '' : 'none';
    detailWhy.style.display = hasWhy ? '' : 'none';
    if (hasWhy) {
      // Split into paragraphs on "||" or blank lines
      var paras = item.why.split(/\s*\|\|\s*|\n{2,}/);
      detailWhy.innerHTML = paras.map(function (p) {
        return '<p class="registry-detail-desc">' + esc(p) + '</p>';
      }).join('');
    } else {
      detailWhy.innerHTML = '';
    }

    // Optional photo gallery (e.g. LEMO's club-volleyball photos)
    var gallery = item.gallery || [];
    detailGallery.innerHTML = '';
    detailGallery.style.display = gallery.length ? '' : 'none';
    // Angled, overlapping "pile of snapshots" look when requested
    detailGallery.classList.toggle('is-scatter', item.galleryStyle === 'scatter');
    for (var g = 0; g < gallery.length; g++) {
      var gi = document.createElement('img');
      gi.src = gallery[g];
      gi.alt = '';
      gi.loading = 'lazy';
      detailGallery.appendChild(gi);
    }

    // No image? Switch the modal to its single-column layout
    var detailBox = detailModal.querySelector('.registry-detail-grid');
    detailBox.classList.toggle('registry-detail-grid--noimg', !!item.isCause && !item.image);

    // Zoom the image to trim whitespace (e.g. a logo with lots of padding)
    detailImgwrap.classList.toggle('is-zoom', item.imageFit === 'zoom');

    if (item.price && !item.isCause) {
      detailPrice.textContent = item.price;
      detailPrice.style.display = '';
    } else {
      detailPrice.style.display = 'none';
    }

    if (item.image) {
      detailImg.src = item.image;
      detailImg.alt = item.name;
      detailImgwrap.classList.remove('registry-detail-imgwrap--empty');
      detailImgwrap.style.display = '';
    } else if (item.isCause) {
      detailImgwrap.style.display = 'none';
    } else {
      detailImg.src = 'images/oak-leaf-favicon.png';
      detailImg.alt = '';
      detailImgwrap.classList.add('registry-detail-imgwrap--empty');
      detailImgwrap.style.display = '';
    }

    // Gifts that come straight to us (the fund, or a Venmo link) open a
    // Venmo/Zelle chooser; charities link out to their own donate page.
    var isDirectGift = !!item.isCause && (!!item.isFund || /venmo\.com/i.test(item.link || ''));

    // Build the right actions for this card
    var html = '';
    if (item.isCause) {
      if (isDirectGift) {
        html = '<button type="button" class="registry-mark-btn" id="detail-donate-btn">' +
          esc(item.cta || 'Contribute') + '</button>';
      } else {
        html = '<a class="registry-mark-btn" id="detail-donate-btn" href="' + esc(item.link) +
          '" target="_blank" rel="noopener">' + esc(item.cta || 'Contribute') + '</a>';
      }
    } else {
      html = '<a class="registry-view-btn" href="' + esc(item.link) +
        '" target="_blank" rel="noopener">View item</a>';
      if (item.reserved) {
        html += '<span class="registry-reserved-badge">Reserved</span>';
      } else {
        html += '<button type="button" class="registry-mark-btn" id="detail-mark-btn">Mark as purchased</button>';
      }
    }
    detailActions.innerHTML = html;

    var markBtn = document.getElementById('detail-mark-btn');
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        closeDetail();
        openPurchaseModal(item);
      });
    }

    var donateBtn = document.getElementById('detail-donate-btn');
    if (donateBtn) {
      donateBtn.addEventListener('click', function () {
        if (isDirectGift) {
          // Money comes straight to us: offer a Venmo/Zelle chooser (no external
          // link to follow), then the record step happens from there.
          closeDetail();
          openPaymentModal(item);
        } else {
          // Charity: the link opens their donate page in a new tab; follow up
          // with the record-donation modal for a thank-you.
          setTimeout(function () {
            closeDetail();
            openDonationModal(item.name, false, false);
          }, 200);
        }
      });
    }

    detailModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    detailModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  /* ---------- Purchase modal ---------- */
  function openPurchaseModal(item) {
    activeItemId = item.id;
    modalTitle.textContent = 'Mark ' + item.name + ' as purchased';
    modalError.textContent = '';
    nameInput.value = '';
    noteInput.value = '';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm purchase';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    nameInput.focus();
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    activeItemId = null;
  }

  /* ---------- Donation-record modal ---------- */
  function openDonationModal(charity, isFund, hideAmount) {
    activeCharity = charity;
    // Hide the amount field when the money comes straight to us (honeymoon
    // fund + Venmo-based gifts like ALA) — the amount is redundant there.
    var amountGroup = donorAmount.closest('.form-group');
    if (amountGroup) amountGroup.style.display = hideAmount ? 'none' : '';
    // The honeymoon fund is a gift to us, not a charity donation — soften the
    // wording so it doesn't read like a tax-deductible donation.
    if (isFund) {
      donationTitle.textContent = 'Let us know about your gift';
      donationHelp.textContent = 'If you sent a gift to our honeymoon fund, feel free to let us know here so we can send you a proper thank you. This is completely optional.';
      activeDonationLabel = 'Record gift';
    } else {
      donationTitle.textContent = 'Record your donation to ' + charity;
      donationHelp.textContent = 'If you donated, feel free to let us know here so we can send you a proper thank you. This is completely optional.';
      activeDonationLabel = 'Record donation';
    }
    donationError.textContent = '';
    donorName.value = '';
    donorAmount.value = '';
    donorNote.value = '';
    donationConfirm.disabled = false;
    donationConfirm.textContent = activeDonationLabel;
    donationModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    donorName.focus();
  }

  function closeDonationModal() {
    donationModal.style.display = 'none';
    document.body.style.overflow = '';
    activeCharity = null;
  }

  /* ---------- Payment method chooser (Venmo or Zelle) ---------- */
  function openPaymentModal(item) {
    activePaymentItem = item;
    // Venmo opens the same handle we send money to
    paymentVenmoLink.href = item.link || 'https://venmo.com/u/jennagarden';

    paymentHelp.textContent = 'Choose whichever is easiest!';
    if (item.isFund) {
      paymentTitle.textContent = 'Send your gift';
      paymentRecordBtn.textContent = 'Let us know about your gift';
    } else {
      paymentTitle.textContent = 'Send your donation';
      paymentRecordBtn.textContent = 'Let us know about your donation';
    }

    // Reset the Zelle copy button label in case it was left as "Copied!"
    var zelleCopy = document.getElementById('payment-zelle-copy');
    if (zelleCopy) zelleCopy.textContent = 'Copy number';

    paymentModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closePaymentModal() {
    paymentModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // From the payment chooser, move on to the optional "let us know" step
  function paymentToRecord() {
    var item = activePaymentItem;
    closePaymentModal();
    if (item) openDonationModal(item.name, !!item.isFund, true);
  }

  function submitDonation() {
    var name = donorName.value.trim();
    if (!name) {
      donationError.textContent = 'Please enter your name.';
      donorName.focus();
      return;
    }
    donationError.textContent = '';
    donationConfirm.disabled = true;
    donationConfirm.textContent = 'Saving…';

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'recordDonation',
        charity: activeCharity,
        name: name,
        amount: donorAmount.value.trim(),
        note: donorNote.value.trim()
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          closeDonationModal();
        } else {
          donationError.textContent = 'Something went wrong. Please try again.';
          donationConfirm.disabled = false;
          donationConfirm.textContent = activeDonationLabel;
        }
      })
      .catch(function () {
        donationError.textContent = 'Something went wrong. Please try again.';
        donationConfirm.disabled = false;
        donationConfirm.textContent = 'Record donation';
      });
  }

  function wireModals() {
    document.getElementById('registry-detail-close').addEventListener('click', closeDetail);
    detailModal.addEventListener('click', function (e) {
      if (e.target === detailModal) closeDetail();
    });

    document.getElementById('registry-modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    document.getElementById('donation-close').addEventListener('click', closeDonationModal);
    donationModal.addEventListener('click', function (e) {
      if (e.target === donationModal) closeDonationModal();
    });
    donationConfirm.addEventListener('click', submitDonation);

    // Payment chooser (Venmo / Zelle)
    document.getElementById('payment-close').addEventListener('click', closePaymentModal);
    paymentModal.addEventListener('click', function (e) {
      if (e.target === paymentModal) closePaymentModal();
    });
    paymentRecordBtn.addEventListener('click', paymentToRecord);
    // Opening Venmo still leads to the "let us know" step so it isn't skipped
    paymentVenmoLink.addEventListener('click', function () {
      setTimeout(paymentToRecord, 300);
    });
    var zelleCopy = document.getElementById('payment-zelle-copy');
    if (zelleCopy) {
      zelleCopy.addEventListener('click', function () {
        var num = '(831) 710-0310';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(num).then(function () {
            zelleCopy.textContent = 'Copied!';
          }).catch(function () {});
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (modal.style.display === 'flex') closeModal();
      else if (paymentModal.style.display === 'flex') closePaymentModal();
      else if (donationModal.style.display === 'flex') closeDonationModal();
      else if (detailModal.style.display === 'flex') closeDetail();
    });

    confirmBtn.addEventListener('click', submitPurchase);
  }

  function submitPurchase() {
    var name = nameInput.value.trim();
    var note = noteInput.value.trim();

    if (!name) {
      modalError.textContent = 'Please enter your name.';
      nameInput.focus();
      return;
    }

    modalError.textContent = '';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving…';

    var itemId = activeItemId;
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'markPurchased',
        itemId: itemId,
        buyerName: name,
        buyerEmail: '',
        note: note
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success || res.error === 'already-reserved') {
          // Either we reserved it, or someone else beat us to it — both mean
          // the item is now taken, so reflect that on the card.
          markCardReserved(itemId);
          closeModal();
        } else {
          modalError.textContent = 'Something went wrong. Please try again.';
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm purchase';
        }
      })
      .catch(function () {
        modalError.textContent = 'Something went wrong. Please try again.';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm purchase';
      });
  }

  // Flip a card (and its cached item) to Reserved without reloading
  function markCardReserved(itemId) {
    if (itemsById[itemId]) itemsById[itemId].reserved = true;
    var card = grid.querySelector('.registry-item[data-id="' + cssEscape(itemId) + '"]');
    if (!card) return;
    card.classList.add('is-reserved');
    var actions = card.querySelector('.registry-item-actions');
    if (actions) {
      actions.innerHTML = '<span class="registry-reserved-badge">Reserved</span>';
    }
  }

  /* ---------- helpers ---------- */
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Escape a value for use inside a CSS attribute selector
  function cssEscape(str) {
    return String(str).replace(/["\\]/g, '\\$&');
  }
})();
