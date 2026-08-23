/**
 * Milk Mondays — mc-app.js
 * Members' Corner client-side logic.
 * ─────────────────────────────────────────────────────────────────────────────
 * What this file handles:
 *   1. Notify form — collects email interest before payment is live
 *   2. Edition card reader — opens page-flip embed in the overlay
 *   3. Reader overlay — open / close / keyboard dismiss
 *   4. Payment hook — mcHandlePurchase() is the single function to wire up
 *      when you add a payment provider. Nothing else in the HTML needs to change.
 *
 * PAYMENT INTEGRATION POINT:
 *   Search for "PAYMENT HOOK" in this file. There is exactly one place.
 *   Replace the console.log with your provider's checkout call.
 *   e.g. for Lemon Squeezy: LemonSqueezy.Url.Open(checkoutUrl)
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    /* ── CONFIG ── */

    /*
     * MM_MEMBERS_ENABLED:
     *   false  → "Coming Soon" mode. Editions grid is hidden. Notify form is shown.
     *   true   → Live mode. Editions grid is shown. Coming-soon section is hidden.
     *
     * Flip this to true when you publish your first edition.
     */
    var MM_MEMBERS_ENABLED = false;

    /*
     * MC_NOTIFY_ENDPOINT:
     *   Where the notify form POSTs to.
     *   Options:
     *     - A Cloudflare Pages Function at /api/mc-notify (you build this later)
     *     - A Brevo / Mailchimp subscribe endpoint
     *     - A Google Forms prefill URL
     *     - Leave as null to use the mailto fallback (no backend needed now)
     */
    var MC_NOTIFY_ENDPOINT = null; /* e.g. '/api/mc-notify' */

    /* ── DOM REFS ── */
    var comingSoonSection = document.getElementById('mc-coming-soon');
    var editionsGrid      = document.getElementById('mc-editions-grid');
    var notifyForm        = document.getElementById('mc-notify-form');
    var notifyName        = document.getElementById('mc-notify-name');
    var notifyEmail       = document.getElementById('mc-notify-email');
    var notifySubmit      = document.getElementById('mc-notify-submit');
    var notifyMsg         = document.getElementById('mc-notify-msg');

    var readerOverlay     = document.getElementById('mc-reader-overlay');
    var readerIframe      = document.getElementById('mc-reader-iframe');
    var readerClose       = document.getElementById('mc-reader-close');
    var readerTitleLabel  = document.getElementById('mc-reader-title-label');
    var readerLoading     = document.getElementById('mc-reader-loading');

    /* ══════════════════════════════════════════════════════════════════════
       1. ENABLED / COMING-SOON STATE
    ══════════════════════════════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', function () {
        if (MM_MEMBERS_ENABLED) {
            /* Live mode: show editions, hide coming-soon */
            if (comingSoonSection) comingSoonSection.style.display = 'none';
            if (editionsGrid) editionsGrid.classList.remove('hidden');
        } else {
            /* Coming-soon mode: show coming-soon, keep editions hidden */
            if (comingSoonSection) comingSoonSection.style.display = '';
            if (editionsGrid) editionsGrid.classList.add('hidden');
        }

        bindNotifyForm();
        bindEditionCards();
        bindReaderOverlay();
    });


    /* ══════════════════════════════════════════════════════════════════════
       2. NOTIFY FORM
       Collects name + email while the section is in coming-soon mode.
       When MC_NOTIFY_ENDPOINT is null, opens a mailto fallback so you
       still capture interest without needing any backend at all right now.
    ══════════════════════════════════════════════════════════════════════ */
    function bindNotifyForm() {
        if (!notifyForm) return;

        notifyForm.addEventListener('submit', function (e) {
            e.preventDefault();

            var name  = (notifyName  ? notifyName.value.trim()  : '');
            var email = (notifyEmail ? notifyEmail.value.trim() : '');

            /* Basic client-side validation */
            if (name.length < 2) {
                setNotifyMsg('Please enter your name.', 'error');
                if (notifyName) notifyName.focus();
                return;
            }
            if (!isValidEmail(email)) {
                setNotifyMsg('Please enter a valid email address.', 'error');
                if (notifyEmail) notifyEmail.focus();
                return;
            }

            if (notifySubmit) {
                notifySubmit.disabled = true;
                notifySubmit.textContent = 'Sending…';
            }

            if (MC_NOTIFY_ENDPOINT) {
                /* ── POST to your configured endpoint ── */
                fetch(MC_NOTIFY_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, email: email })
                })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data && data.ok) {
                        setNotifyMsg('You\'re on the list. We\'ll email you when the first edition drops.', 'success');
                        notifyForm.reset();
                    } else {
                        setNotifyMsg('Something went wrong. Try again or email us directly.', 'error');
                    }
                })
                .catch(function () {
                    setNotifyMsg('Connection error. Try again shortly.', 'error');
                })
                .finally(function () {
                    if (notifySubmit) {
                        notifySubmit.disabled = false;
                        notifySubmit.innerHTML = 'Notify me <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
                    }
                });

            } else {
                /*
                 * ── MAILTO FALLBACK ──
                 * No backend configured yet. Opens the user's email client
                 * pre-filled with their details so you receive the interest
                 * in your inbox manually. Zero infrastructure needed.
                 */
                var subject = encodeURIComponent('Members\u2019 Corner — Notify Me');
                var body    = encodeURIComponent('Name: ' + name + '\nEmail: ' + email + '\n\nPlease notify me when the first edition drops.');
                window.location.href = 'mailto:milkmondaysbiz@gmail.com?subject=' + subject + '&body=' + body;

                setTimeout(function () {
                    setNotifyMsg('Your email app should have opened. If not, email us at milkmondaysbiz@gmail.com', 'success');
                    if (notifySubmit) {
                        notifySubmit.disabled = false;
                        notifySubmit.innerHTML = 'Notify me <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>';
                    }
                }, 600);
            }
        });
    }

    function setNotifyMsg(text, type) {
        if (!notifyMsg) return;
        notifyMsg.textContent = text;
        notifyMsg.className   = 'mc-notify-msg ' + (type || '');
    }

    function isValidEmail(email) {
        return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
    }


    /* ══════════════════════════════════════════════════════════════════════
       3. EDITION CARDS — Read Preview button → open reader overlay
    ══════════════════════════════════════════════════════════════════════ */
    function bindEditionCards() {
        if (!editionsGrid) return;

        /* Read / preview buttons */
        editionsGrid.addEventListener('click', function (e) {
            var readBtn = e.target.closest('.mc-edition-read-btn');
            if (readBtn && readBtn.dataset.embedUrl) {
                e.preventDefault();
                var card       = readBtn.closest('.mc-edition-card');
                var titleEl    = card ? card.querySelector('.mc-edition-title') : null;
                var editionTitle = titleEl ? titleEl.textContent : 'Edition';
                openReader(readBtn.dataset.embedUrl, editionTitle);
                return;
            }

            /* Buy / unlock buttons */
            var buyBtn = e.target.closest('.mc-edition-buy-btn');
            if (buyBtn) {
                e.preventDefault();
                var editionId = buyBtn.dataset.editionId || '';
                var price     = buyBtn.dataset.price     || '';
                var currency  = buyBtn.dataset.currency  || 'USD';
                mcHandlePurchase(editionId, price, currency, buyBtn);
            }
        });
    }


    /* ══════════════════════════════════════════════════════════════════════
       4. READER OVERLAY — open, close, keyboard, iframe load state
    ══════════════════════════════════════════════════════════════════════ */
    function openReader(embedUrl, editionTitle) {
        if (!readerOverlay || !readerIframe) return;

        if (readerTitleLabel) readerTitleLabel.textContent = editionTitle || 'Reading edition';
        if (readerLoading)    readerLoading.style.display = 'flex';

        readerIframe.src = embedUrl;
        readerOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        /* Hide loading indicator once iframe content begins loading */
        readerIframe.onload = function () {
            if (readerLoading) readerLoading.style.display = 'none';
        };
    }

    function closeReader() {
        if (!readerOverlay || !readerIframe) return;
        readerOverlay.classList.add('hidden');
        document.body.style.overflow = '';
        /* Blank the iframe src on close — stops audio/video if present */
        setTimeout(function () { readerIframe.src = 'about:blank'; }, 300);
        if (readerLoading) readerLoading.style.display = 'flex';
    }

    function bindReaderOverlay() {
        if (!readerOverlay) return;

        if (readerClose) {
            readerClose.addEventListener('click', closeReader);
        }

        /* Click on the dark backdrop (outside the panel) closes the reader */
        readerOverlay.addEventListener('click', function (e) {
            if (e.target === readerOverlay) closeReader();
        });

        /* Escape key closes the reader */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !readerOverlay.classList.contains('hidden')) {
                closeReader();
            }
        });
    }


    /* ══════════════════════════════════════════════════════════════════════
       5. PAYMENT HOOK — mcHandlePurchase()
       ─────────────────────────────────────────────────────────────────────
       THIS IS THE ONLY FUNCTION YOU NEED TO EDIT WHEN YOU ADD PAYMENTS.
       Everything else in this file (and in members-corner.html) stays the same.

       Parameters:
         editionId  — string, the data-edition-id from the card
         price      — string, e.g. "3.99"
         currency   — string, e.g. "USD"
         triggerBtn — the button element (so you can show a loading state)

       What to do here for each provider:
         Lemon Squeezy: call LemonSqueezy.Url.Open(checkoutUrl)
         Stripe:        redirect to /api/editions/create-checkout?id=editionId
         Any other MoR: follow their JS SDK docs, pass editionId + price

       After a successful payment, your webhook handler (server-side) should:
         1. Record the purchase in D1 (email, editionId, orderId, timestamp)
         2. Issue a signed access token (HMAC)
         3. Store it in localStorage as mm_mc_access_<editionId>
         4. Let the reader overlay open the full embed URL
    ══════════════════════════════════════════════════════════════════════ */
    function mcHandlePurchase(editionId, price, currency, triggerBtn) {
        /* PAYMENT HOOK — replace this block when you have a provider */
        console.log('[Members\u2019 Corner] Purchase triggered:', { editionId: editionId, price: price, currency: currency });

        /*
         * Placeholder UX: show a friendly message instead of doing nothing.
         * Remove this when you wire up the real checkout.
         */
        var card = triggerBtn ? triggerBtn.closest('.mc-edition-card') : null;
        if (card) {
            var existingMsg = card.querySelector('.mc-edition-payment-placeholder');
            if (!existingMsg) {
                var msg = document.createElement('p');
                msg.className = 'mc-edition-payment-placeholder';
                msg.textContent = 'Payment coming soon — email milkmondaysbiz@gmail.com to get early access.';
                triggerBtn.insertAdjacentElement('afterend', msg);
            }
        }
    }


    /* ══════════════════════════════════════════════════════════════════════
       6. ACCESS CHECK — mcCheckAccess(editionId)
       ─────────────────────────────────────────────────────────────────────
       Returns true if the reader has a valid locally-stored access token
       for this edition. Call this before opening the full embed URL to
       decide whether to open the full edition or just the preview.

       FUTURE: when server-side verification is added, replace the
       localStorage check with a fetch to /api/mc-check-access.
    ══════════════════════════════════════════════════════════════════════ */
    window.mcCheckAccess = function (editionId) {
        try {
            var raw = localStorage.getItem('mm_mc_access_' + editionId);
            if (!raw) return false;
            var token = JSON.parse(raw);
            if (!token || !token.expiry) return false;
            if (Date.now() > token.expiry) {
                localStorage.removeItem('mm_mc_access_' + editionId);
                return false;
            }
            return true;
        } catch (_) {
            return false;
        }
    };

}());