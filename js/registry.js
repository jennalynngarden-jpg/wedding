/* ========================================
   Registry Page
   - Loads items from the Google Sheet (via Apps Script)
   - Lets guests mark an item purchased (records name/email/note)
   ======================================== */

(function () {
  // Same Apps Script web app as the RSVP + photos features
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';

  var grid = document.getElementById('registry-grid');
  var statusEl = document.getElementById('registry-status');
  var modal = document.getElementById('registry-modal');
  var modalItem = document.getElementById('registry-modal-item');
  var modalError = document.getElementById('registry-modal-error');
  var nameInput = document.getElementById('buyer-name');
  var emailInput = document.getElementById('buyer-email');
  var noteInput = document.getElementById('buyer-note');
  var confirmBtn = document.getElementById('registry-confirm');

  if (!grid) return;

  var activeItemId = null;

  document.addEventListener('DOMContentLoaded', loadRegistry);

  function loadRegistry() {
    fetch(APPS_SCRIPT_URL + '?action=getRegistry')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data.items || [];
        if (items.length === 0) {
          statusEl.textContent = 'Our registry is coming soon — check back shortly!';
          return;
        }
        statusEl.style.display = 'none';
        renderItems(items);
      })
      .catch(function () {
        statusEl.textContent = 'We couldn’t load the registry right now. Please try again later.';
      });
  }

  function renderItems(items) {
    grid.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      grid.appendChild(buildCard(items[i]));
    }
  }

  function buildCard(item) {
    var card = document.createElement('div');
    card.className = 'registry-item' + (item.reserved ? ' is-reserved' : '');
    card.setAttribute('data-id', item.id);

    // Image (or a soft placeholder if none could be pulled)
    var imageHtml;
    if (item.image) {
      imageHtml = '<a class="registry-item-imgwrap" href="' + esc(item.link) +
        '" target="_blank" rel="noopener">' +
        '<img class="registry-item-img" src="' + esc(item.image) + '" alt="' + esc(item.name) +
        '" loading="lazy"></a>';
    } else {
      imageHtml = '<a class="registry-item-imgwrap registry-item-imgwrap--empty" href="' +
        esc(item.link) + '" target="_blank" rel="noopener">' +
        '<img src="images/oak-leaf-favicon.png" alt="" class="registry-item-noimg"></a>';
    }

    var priceHtml = item.price
      ? '<p class="registry-item-price">' + esc(item.price) + '</p>' : '';

    var actionHtml = item.reserved
      ? '<span class="registry-reserved-badge">Reserved</span>'
      : '<button type="button" class="registry-mark-btn">Mark as purchased</button>';

    card.innerHTML =
      imageHtml +
      '<div class="registry-item-body">' +
        '<h3 class="registry-item-name">' + esc(item.name) + '</h3>' +
        priceHtml +
        '<p class="registry-item-desc">' + esc(item.description) + '</p>' +
        '<div class="registry-item-actions">' +
          '<a class="registry-view-btn" href="' + esc(item.link) +
            '" target="_blank" rel="noopener">View item</a>' +
          actionHtml +
        '</div>' +
      '</div>';

    // Wire up the "Mark as purchased" button (absent when reserved)
    var markBtn = card.querySelector('.registry-mark-btn');
    if (markBtn) {
      markBtn.addEventListener('click', function () {
        openModal(item);
      });
    }

    return card;
  }

  /* ---------- Purchase modal ---------- */
  function openModal(item) {
    activeItemId = item.id;
    modalItem.textContent = item.name;
    modalError.textContent = '';
    nameInput.value = '';
    emailInput.value = '';
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

  document.getElementById('registry-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
  });

  confirmBtn.addEventListener('click', submitPurchase);

  function submitPurchase() {
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var note = noteInput.value.trim();

    if (!name) {
      modalError.textContent = 'Please enter your name.';
      nameInput.focus();
      return;
    }
    if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) {
      modalError.textContent = 'Please enter a valid email.';
      emailInput.focus();
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
        buyerEmail: email,
        note: note
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          markCardReserved(itemId);
          closeModal();
        } else if (res.error === 'already-reserved') {
          // Someone grabbed it first — reflect that and close
          markCardReserved(itemId);
          modalError.textContent = '';
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

  // Swap a card's button for a "Reserved" badge without reloading
  function markCardReserved(itemId) {
    var card = grid.querySelector('.registry-item[data-id="' + cssEscape(itemId) + '"]');
    if (!card) return;
    card.classList.add('is-reserved');
    var actions = card.querySelector('.registry-item-actions');
    var markBtn = card.querySelector('.registry-mark-btn');
    if (markBtn) markBtn.remove();
    if (actions && !actions.querySelector('.registry-reserved-badge')) {
      var badge = document.createElement('span');
      badge.className = 'registry-reserved-badge';
      badge.textContent = 'Reserved';
      actions.appendChild(badge);
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
