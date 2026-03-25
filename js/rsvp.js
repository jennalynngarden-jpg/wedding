/* ========================================
   RSVP Multi-Step Form
   ======================================== */

(function () {
  'use strict';

  /* ---------- Configuration ---------- */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';
  var MEAL_OPTIONS = [
    { value: 'Filet Mignon',       description: 'Herb-crusted beef tenderloin with roasted garlic butter and seasonal vegetables' },
    { value: 'Pan-Seared Chicken', description: 'Free-range chicken breast with lemon herb sauce and wild rice pilaf' },
    { value: 'Grilled Salmon',     description: 'Atlantic salmon fillet with dill cream sauce and roasted asparagus' }
  ];
  var KIDS_MEAL = { value: "Kids' Meal", description: 'Chicken tenders with mac & cheese and fresh fruit' };
  var MAX_PHOTO_SIZE = 10 * 1024 * 1024;

  /* ---------- State ---------- */
  var state = {
    currentStep: '1',
    selectedGuest: null,
    partyMembers: [],
    mealChoices: {},
    dietaryRestrictions: {},
    songRequest: '',
    specialSong: '',
    partnershipStatus: '',
    stepFlow: ['1', '2', '3', '4'],  // Default flow; rebuilt after fetching party data
    photoFile: null,
    photoBase64: null
  };

  /* ---------- Step Flow ---------- */

  // Builds the ordered list of step IDs based on whether the guest
  // is married or in a long-term partnership. Called after fetching party data.
  function buildStepFlow() {
    var flow = ['1', '2', '3'];
    if (state.partnershipStatus === 'married' || state.partnershipStatus === 'partner') {
      flow.push('special-song');
    }
    flow.push('4');
    state.stepFlow = flow;
  }

  // Creates the right number of progress dots for the current flow
  function renderProgressDots() {
    var container = document.getElementById('rsvp-progress');
    var html = '';
    for (var i = 0; i < state.stepFlow.length; i++) {
      if (i > 0) html += '<div class="progress-line"></div>';
      html += '<div class="progress-dot"></div>';
    }
    container.innerHTML = html;
  }

  // Returns the next step ID in the flow, or null if at the end
  function getNextStep() {
    var idx = state.stepFlow.indexOf(String(state.currentStep));
    return (idx < state.stepFlow.length - 1) ? state.stepFlow[idx + 1] : null;
  }

  // Returns the previous step ID in the flow, or null if at the start
  function getPrevStep() {
    var idx = state.stepFlow.indexOf(String(state.currentStep));
    return (idx > 0) ? state.stepFlow[idx - 1] : null;
  }

  /* ---------- Step Navigation ---------- */

  function goToStep(stepId) {
    var steps = document.querySelectorAll('.rsvp-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.remove('active');
    }
    var target = document.getElementById('step-' + stepId);
    if (target) {
      target.classList.add('active');
      target.style.display = '';
    }
    state.currentStep = stepId;
    updateProgressDots(stepId);
    document.getElementById('rsvp-form-container').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function updateProgressDots(stepId) {
    var currentIndex = state.stepFlow.indexOf(String(stepId));
    var dots = document.querySelectorAll('.progress-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].classList.remove('active', 'completed');
      if (i === currentIndex) {
        dots[i].classList.add('active');
      } else if (i < currentIndex) {
        dots[i].classList.add('completed');
      }
    }
  }

  function hideAllSteps() {
    var steps = document.querySelectorAll('.rsvp-step');
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.remove('active');
    }
  }

  function showTerminalStep(id) {
    hideAllSteps();
    var el = document.getElementById(id);
    el.style.display = '';
    el.classList.add('active');
    document.getElementById('rsvp-progress').style.display = 'none';
    var intro = document.getElementById('rsvp-intro');
    if (intro) intro.style.display = 'none';
  }

  /* ---------- Step 1: Guest Search ---------- */
  var searchTimeout = null;

  function initSearch() {
    var input = document.getElementById('guest-search');
    if (!input) return;

    input.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      var query = this.value.trim();
      if (query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        return;
      }
      searchTimeout = setTimeout(function () {
        fetchGuests(query);
      }, 300);
    });
  }

  function fetchGuests(query) {
    var resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = '<p class="search-loading">Searching...</p>';

    var url = APPS_SCRIPT_URL + '?action=searchGuests&query=' + encodeURIComponent(query);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderSearchResults(data.guests || []);
      })
      .catch(function () {
        resultsEl.innerHTML = '<p class="no-results">Something went wrong. Please try again.</p>';
      });
  }

  function renderSearchResults(guests) {
    var container = document.getElementById('search-results');
    if (guests.length === 0) {
      container.innerHTML = '<p class="no-results">No matching names found. Please check the spelling or contact us.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < guests.length; i++) {
      html += '<button type="button" class="search-result-item" ' +
        'data-guest-id="' + guests[i].guestId + '" ' +
        'data-party-id="' + guests[i].partyId + '" ' +
        'data-name="' + guests[i].displayName + '">' +
        guests[i].displayName + '</button>';
    }
    container.innerHTML = html;

    var items = container.querySelectorAll('.search-result-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', onGuestSelected);
    }
  }

  function onGuestSelected(e) {
    var btn = e.currentTarget;
    state.selectedGuest = {
      guestId: btn.getAttribute('data-guest-id'),
      partyId: btn.getAttribute('data-party-id'),
      displayName: btn.getAttribute('data-name')
    };
    fetchParty(state.selectedGuest.guestId);
  }

  /* ---------- Step 2: Party Members ---------- */
  function fetchParty(guestId) {
    var url = APPS_SCRIPT_URL + '?action=getParty&guestId=' + encodeURIComponent(guestId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.partyMembers = [];
        for (var i = 0; i < data.members.length; i++) {
          var m = data.members[i];
          state.partyMembers.push({
            guestId: m.guestId,
            displayName: m.displayName,
            relationship: m.relationship,
            attending: m.relationship !== 'plusone' ? 'yes' : 'no'
          });
        }

        // Set up the step flow based on the guest's partnership status
        state.partnershipStatus = data.partnershipStatus || '';
        buildStepFlow();
        renderProgressDots();

        // Set the special song heading based on married vs. partner
        if (state.partnershipStatus === 'married') {
          document.getElementById('special-song-heading').textContent =
            'What was your first dance song at your wedding?';
        } else if (state.partnershipStatus === 'partner') {
          document.getElementById('special-song-heading').textContent =
            "What's a song that's special to you and your partner?";
        }

        renderPartyMembers();
        goToStep('2');
      });
  }

  function renderPartyMembers() {
    var container = document.getElementById('party-members');
    var html = '';
    for (var i = 0; i < state.partyMembers.length; i++) {
      var m = state.partyMembers[i];
      var isPlusOne = m.relationship === 'plusone';

      var selectHtml = '<select class="attendance-select" data-index="' + i + '">' +
        '<option value="yes"' + (m.attending === 'yes' ? ' selected' : '') + '>Coming</option>' +
        '<option value="no"' + (m.attending === 'no' ? ' selected' : '') + '>Can\'t come</option>' +
        '</select>';

      if (isPlusOne) {
        var primaryName = state.selectedGuest ? state.selectedGuest.displayName.split(' ')[0] : 'Guest';
        html += '<div class="party-member-row party-member-plusone">' +
          '<input type="text" class="plusone-name-input" data-index="' + i + '" ' +
          'placeholder="' + primaryName + '\'s +1" autocomplete="off">' +
          selectHtml +
          '</div>';
      } else {
        html += '<div class="party-member-row">' +
          '<span class="party-member-name">' + m.displayName + '</span>' +
          selectHtml +
          '</div>';
      }
    }
    container.innerHTML = html;

    var selects = container.querySelectorAll('.attendance-select');
    for (var j = 0; j < selects.length; j++) {
      selects[j].addEventListener('change', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        state.partyMembers[idx].attending = this.value;
      });
    }

    // Update plus-one display names as they type
    var plusOneInputs = container.querySelectorAll('.plusone-name-input');
    for (var k = 0; k < plusOneInputs.length; k++) {
      plusOneInputs[k].addEventListener('input', function () {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        state.partyMembers[idx].displayName = this.value.trim() || '+1 Guest';
      });
    }
  }

  function getSelectedMembers() {
    var selected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].attending === 'yes') {
        selected.push(state.partyMembers[i]);
      }
    }
    return selected;
  }

  function getUnselectedMembers() {
    var unselected = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      if (state.partyMembers[i].attending !== 'yes') {
        unselected.push(state.partyMembers[i]);
      }
    }
    return unselected;
  }

  /* ---------- Step 3: Meal Selections ---------- */
  function renderMealSelections() {
    var container = document.getElementById('meal-selections');
    var members = getSelectedMembers();
    var html = '';

    // Adjust heading for single-person parties
    var step3 = document.getElementById('step-3');
    var heading = step3.querySelector('.step-heading');
    var description = step3.querySelector('.step-description');
    if (members.length === 1) {
      heading.textContent = 'Dinner selection';
      description.style.display = 'none';
    } else {
      heading.textContent = 'Dinner selections';
      description.style.display = '';
    }

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      html += '<div class="meal-guest-group">';
      html += '<h4 class="meal-guest-name">' + m.displayName + '</h4>';
      html += '<div class="meal-options">';
      var options = (m.relationship === 'child') ? [KIDS_MEAL].concat(MEAL_OPTIONS) : MEAL_OPTIONS;
      for (var j = 0; j < options.length; j++) {
        var opt = options[j];
        var inputName = 'meal-' + m.guestId;
        html += '<label class="meal-option">' +
          '<input type="radio" name="' + inputName + '" value="' + opt.value + '">' +
          '<span class="meal-option-text">' +
            '<span class="meal-option-header">' + opt.value + '</span>' +
            '<span class="meal-option-description">' + opt.description + '</span>' +
          '</span>' +
          '</label>';
      }
      html += '</div>';
      html += '<div class="form-group">' +
        '<label>Dietary restrictions or allergies</label>' +
        '<input type="text" class="dietary-input" data-guest-id="' + m.guestId + '" ' +
        'placeholder="e.g., gluten-free, nut allergy">' +
        '</div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function collectMealData() {
    var members = getSelectedMembers();
    state.mealChoices = {};
    state.dietaryRestrictions = {};

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var selected = document.querySelector('input[name="meal-' + m.guestId + '"]:checked');
      state.mealChoices[m.guestId] = selected ? selected.value : '';

      var dietaryInput = document.querySelector('.dietary-input[data-guest-id="' + m.guestId + '"]');
      state.dietaryRestrictions[m.guestId] = dietaryInput ? dietaryInput.value.trim() : '';
    }
  }

  /* ---------- Step 4: Photo Upload ---------- */
  function initPhotoUpload() {
    var dropzone = document.getElementById('upload-dropzone');
    var fileInput = document.getElementById('photo-input');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', function () {
      fileInput.click();
    });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handlePhotoFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (this.files.length > 0) {
        handlePhotoFile(this.files[0]);
      }
    });

    document.getElementById('remove-photo').addEventListener('click', function () {
      state.photoFile = null;
      state.photoBase64 = null;
      document.getElementById('upload-preview').style.display = 'none';
      document.getElementById('upload-dropzone').style.display = '';
    });
  }

  function handlePhotoFile(file) {
    if (file.size > MAX_PHOTO_SIZE) {
      showModal('Photo too large', 'Please choose a photo under 10 MB.');
      return;
    }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      showModal('Unsupported format', 'Please upload a JPG, PNG, or WebP image.');
      return;
    }

    state.photoFile = file;

    var reader = new FileReader();
    reader.onload = function (e) {
      document.getElementById('preview-img').src = e.target.result;
      document.getElementById('upload-preview').style.display = '';
      document.getElementById('upload-dropzone').style.display = 'none';
      state.photoBase64 = e.target.result.split(',')[1];
    };
    reader.readAsDataURL(file);
  }

  /* ---------- Submission ---------- */
  function submitRsvp() {
    collectMealData();
    state.songRequest = document.getElementById('song-request').value.trim();

    // Collect the special song if the step was shown
    var specialSongInput = document.getElementById('special-song-input');
    state.specialSong = specialSongInput ? specialSongInput.value.trim() : '';

    var members = getSelectedMembers();
    var unselected = getUnselectedMembers();
    var guests = [];
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      guests.push({
        guestId: m.guestId,
        guestName: m.displayName,
        attending: 'yes',
        mealChoice: state.mealChoices[m.guestId] || '',
        dietaryRestrictions: state.dietaryRestrictions[m.guestId] || '',
        songRequest: state.songRequest
      });
    }
    // Record unchecked party members as not attending
    for (var k = 0; k < unselected.length; k++) {
      guests.push({
        guestId: unselected[k].guestId,
        guestName: unselected[k].displayName,
        attending: 'no',
        mealChoice: '',
        dietaryRestrictions: '',
        songRequest: ''
      });
    }

    var payload = {
      action: 'submitRsvp',
      partyId: state.selectedGuest.partyId,
      submittedBy: state.selectedGuest.guestId,
      specialSong: state.specialSong,
      guests: guests
    };

    var submitBtn = document.getElementById('submit-rsvp');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success && state.photoBase64) {
        return uploadPhoto();
      }
    })
    .then(function () {
      showTerminalStep('step-confirmation');
      fetchAttendees();
    })
    .catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit RSVP';
      showModal('Something went wrong', 'Please try again.');
    });
  }

  function submitDecline() {
    // When declining, mark ALL party members (selected + unselected) as not attending
    var guests = [];
    for (var i = 0; i < state.partyMembers.length; i++) {
      guests.push({
        guestId: state.partyMembers[i].guestId,
        guestName: state.partyMembers[i].displayName,
        attending: 'no',
        mealChoice: '',
        dietaryRestrictions: '',
        songRequest: ''
      });
    }

    var payload = {
      action: 'submitRsvp',
      partyId: state.selectedGuest.partyId,
      submittedBy: state.selectedGuest.guestId,
      guests: guests
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(function () { showTerminalStep('step-decline'); })
    .catch(function () { showTerminalStep('step-decline'); });
  }

  function uploadPhoto() {
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadPhoto',
        partyId: state.selectedGuest.partyId,
        fileName: state.photoFile.name,
        mimeType: state.photoFile.type,
        base64Data: state.photoBase64
      })
    }).then(function (r) { return r.json(); });
  }

  /* ---------- Attendee List ---------- */
  function fetchAttendees() {
    var url = APPS_SCRIPT_URL + '?action=getAttendees&excludeParty=' + encodeURIComponent(state.selectedGuest.partyId);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderAttendees(data);
      })
      .catch(function () {});
  }

  function renderAttendees(data) {
    var container = document.getElementById('attendee-list');
    if (!container) return;

    var brideParties = data.bride || [];
    var groomParties = data.groom || [];

    if (brideParties.length === 0 && groomParties.length === 0) {
      return;
    }

    var section = document.getElementById('attendee-section');
    if (section) section.style.display = '';

    var html = '';

    if (brideParties.length > 0) {
      html += '<div class="attendee-group">';
      html += '<h4 class="attendee-group-heading">Jenna\'s side</h4>';
      for (var i = 0; i < brideParties.length; i++) {
        html += '<div class="attendee-party">';
        for (var j = 0; j < brideParties[i].names.length; j++) {
          html += '<p class="attendee-name">' + brideParties[i].names[j] + '</p>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    if (groomParties.length > 0) {
      html += '<div class="attendee-group">';
      html += '<h4 class="attendee-group-heading">Liam\'s side</h4>';
      for (var i = 0; i < groomParties.length; i++) {
        html += '<div class="attendee-party">';
        for (var j = 0; j < groomParties[i].names.length; j++) {
          html += '<p class="attendee-name">' + groomParties[i].names[j] + '</p>';
        }
        html += '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  /* ---------- Modal ---------- */
  function showModal(heading, message) {
    document.getElementById('modal-heading').textContent = heading;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-overlay').style.display = '';
  }

  function initModal() {
    var overlay = document.getElementById('modal-overlay');
    var closeBtn = document.getElementById('modal-close');
    if (!overlay || !closeBtn) return;

    closeBtn.addEventListener('click', function () {
      overlay.style.display = 'none';
    });

    // Also close when clicking the dark background
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  }

  /* ---------- Validation ---------- */
  function validateCurrentStep() {
    if (state.currentStep === '2') {
      // Ensure plus-ones marked as coming have a name entered
      var selected = getSelectedMembers();
      for (var p = 0; p < selected.length; p++) {
        if (selected[p].relationship === 'plusone' && (!selected[p].displayName || selected[p].displayName === '+1 Guest')) {
          showModal('Name missing', "Don't forget to enter a name for your +1 guest.");
          return false;
        }
      }
    }
    if (state.currentStep === '3') {
      var members = getSelectedMembers();
      var missingNames = [];
      for (var i = 0; i < members.length; i++) {
        var checked = document.querySelector('input[name="meal-' + members[i].guestId + '"]:checked');
        if (!checked) {
          missingNames.push(members[i].displayName.split(' ')[0]);
        }
      }
      if (missingNames.length > 0) {
        var nameList;
        if (missingNames.length === 1) {
          nameList = missingNames[0];
        } else {
          nameList = missingNames.slice(0, -1).join(', ') + ' and ' + missingNames[missingNames.length - 1];
        }
        showModal('Meal selection missing', "Don't forget to select a meal for " + nameList + ".");
        return false;
      }
    }
    return true;
  }

  /* ---------- Init ---------- */
  function init() {
    if (!document.getElementById('rsvp-form-container')) return;

    initSearch();
    initPhotoUpload();
    initModal();

    // Render the initial progress dots (4 steps by default)
    renderProgressDots();
    updateProgressDots('1');

    var backBtns = document.querySelectorAll('.step-btn--back');
    for (var i = 0; i < backBtns.length; i++) {
      backBtns[i].addEventListener('click', function () {
        var prev = getPrevStep();
        if (prev) goToStep(prev);
      });
    }

    var nextBtns = document.querySelectorAll('.step-btn--next');
    for (var j = 0; j < nextBtns.length; j++) {
      nextBtns[j].addEventListener('click', function () {
        if (!validateCurrentStep()) return;

        if (state.currentStep === '2') {
          var attending = getSelectedMembers();
          if (attending.length === 0) {
            submitDecline();
            return;
          }
          renderMealSelections();
        }

        var next = getNextStep();
        if (next) goToStep(next);
      });
    }

    // Skip button on the special song step — clears the input and moves on
    var skipBtn = document.getElementById('skip-special-song');
    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        document.getElementById('special-song-input').value = '';
        var next = getNextStep();
        if (next) goToStep(next);
      });
    }

    document.getElementById('submit-rsvp').addEventListener('click', function () {
      submitRsvp();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
