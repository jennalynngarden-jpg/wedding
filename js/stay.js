/* ========================================
   Wedding Party Stay Form (stay.html)
   An anonymous, step-by-step form. Answers go to the "Wedding party stay"
   tab of the RSVP spreadsheet (see submitStaySurvey in Code.gs).
   ======================================== */

(function () {
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxMldY7OfwgI-AaEhLRxgqVW_Du_Z9YdANivvVzGfA7MkVMFaA_MkPbyMPYcqSW2SszOQ/exec';

  var form = document.getElementById('stay-form');
  if (!form) return;
  var steps = form.querySelectorAll('.rsvp-step');
  var current = 0;

  // A random ID for this set of answers. It isn't tied to anyone; it just
  // lets the script ignore a backup copy if the same answers arrive twice.
  var responseId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ---------- Moving between steps ---------- */
  function showStep(index) {
    steps[current].classList.remove('active');
    current = index;
    steps[current].classList.add('active');
    hideError();
    // Bring the top of the form into view (handy on phones after a long step)
    var top = form.getBoundingClientRect().top + window.pageYOffset - 90;
    if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: 'smooth' });
  }

  form.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dir]');
    if (!btn) return;
    if (btn.getAttribute('data-dir') === 'prev') {
      showStep(current - 1);
    } else if (stepIsComplete()) {
      showStep(current + 1);
    }
  });

  /* ---------- Checking required questions ---------- */
  // A question is required if its fieldset has data-required (the message to
  // show). It counts as answered once anything in it is chosen.
  function stepIsComplete() {
    var questions = steps[current].querySelectorAll('[data-required]');
    for (var i = 0; i < questions.length; i++) {
      if (!questions[i].querySelector('input:checked')) {
        showError(questions[i].getAttribute('data-required'));
        return false;
      }
    }
    return true;
  }

  function showError(message) {
    var box = steps[current].querySelector('.step-error');
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
  }

  function hideError() {
    var box = steps[current].querySelector('.step-error');
    if (box) box.hidden = true;
  }

  // Answering a question clears the reminder
  form.addEventListener('change', function (e) {
    hideError();
    var input = e.target;

    // "Not sure yet" can't be combined with other choices in the same list
    if (input.type === 'checkbox' && input.checked) {
      var group = form.querySelectorAll('input[name="' + input.name + '"]');
      for (var i = 0; i < group.length; i++) {
        if (group[i] === input) continue;
        if (input.hasAttribute('data-exclusive') || group[i].hasAttribute('data-exclusive')) group[i].checked = false;
      }
    }

    // Hide their first choice from "What else would you be open to?"
    if (input.name === 'firstChoice') {
      var others = form.querySelectorAll('input[name="openTo"]');
      for (var j = 0; j < others.length; j++) {
        var same = others[j].value === input.value;
        others[j].closest('.meal-option').hidden = same;
        if (same) others[j].checked = false;
      }
    }
  });

  /* ---------- Sending the answers ---------- */
  function checkedValues(name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) { return el.value; });
  }

  function collectAnswers() {
    return {
      nights: checkedValues('nights'),
      events: checkedValues('events'),
      partner: checkedValues('partner')[0] || '',
      travel: checkedValues('travel')[0] || '',
      car: checkedValues('car')[0] || '',
      firstChoice: checkedValues('firstChoice')[0] || '',
      openTo: checkedValues('openTo'),
      budget: checkedValues('budget')[0] || '',
      mustHaves: checkedValues('mustHaves'),
      notes: form.querySelector('#stay-notes').value.trim()
    };
  }

  // One try at sending, giving up after 20 seconds. Google answers a saved
  // form with a redirect, which the browser reports as "opaqueredirect":
  // that means it worked (the RSVP page does the same thing).
  function sendOnce(payload) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;
    return fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: controller ? controller.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (r.type === 'opaqueredirect' || r.ok) return true;
      throw new Error('HTTP ' + r.status);
    });
  }

  // Try up to 3 times. Every try has the same ID, so it's never saved twice.
  function send(payload, triesLeft) {
    return sendOnce(payload).catch(function (err) {
      if (triesLeft <= 1) throw err;
      return send(payload, triesLeft - 1);
    });
  }

  var submitBtn = document.getElementById('stay-submit');
  submitBtn.addEventListener('click', function () {
    if (!stepIsComplete()) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    send({ action: 'submitStaySurvey', id: responseId, answers: collectAnswers() }, 3)
      .then(function () {
        showStep(steps.length - 1);  // Thank you
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
        showError('Something went wrong sending your answers. Please check your connection and try again.');
      });
  });
})();
