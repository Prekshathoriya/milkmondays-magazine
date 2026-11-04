(function () {
    'use strict';

    var auth = window.MilkMondaysAuth;
    if (!auth) return;

    var params = new URLSearchParams(window.location.search);
    var redirect = safeRedirect(params.get('redirect'));
    var mode = params.get('mode') || '';
    var challengeId = '';
    var otpPurpose = '';
    var pendingEmail = '';
    var pendingIdentifier = '';
    var pendingPassword = '';
    var views = Array.prototype.slice.call(document.querySelectorAll('.auth-view'));
    var progress = document.getElementById('auth-progress');
    var otpBoxes = Array.prototype.slice.call(document.querySelectorAll('#auth-otp-container .otp-box'));

    bindForm('login-form', login);
    bindForm('signup-email-form', requestSignup);
    bindForm('otp-form', verifyOtp);
    bindForm('credentials-form', createAccount);
    bindForm('recovery-form', requestRecovery);
    bindForm('reset-form', resetPassword);
    bindForm('username-form', changeUsername);
    bindForm('password-form', changePassword);
    bindForm('email-form', requestEmailChange);
    bindForm('email-otp-form', confirmEmailChange);

    bindClick('show-signup', function () { show('signup-view', true); });
    bindClick('show-login', function () { show('login-view', false); });
    bindClick('show-login-2', function () { show('login-view', false); });
    bindClick('show-recovery', function () { show('recovery-view', false); });
    bindClick('back-from-otp', backFromOtp);
    bindClick('resend-otp', resendOtp);
    bindClick('logout-btn', function () { logout(false); });
    bindClick('logout-all-btn', function () { logout(true); });
    wireOtpBoxes();

    auth.getSession(true).then(function (user) {
        if (user) {
            if (mode === 'account') showAccount(user);
            else window.location.replace(redirect);
        } else {
            show('login-view', false);
        }
    });

    function login(event) {
        event.preventDefault();
        var identifier = value('login-identifier');
        var password = value('login-password');
        if (!identifier || !password) return message('login-message', 'Enter your username and password.', true);
        busy('login-submit', true, 'Logging in…');
        auth.post({ action: 'login', identifier: identifier, password: password }).then(function (data) {
            if (data.otpRequired) {
                challengeId = data.challengeId;
                otpPurpose = 'inactive';
                pendingIdentifier = identifier;
                pendingPassword = password;
                setText('otp-destination', data.maskedEmail || 'your email');
                show('otp-view', true, 2);
                clearOtp();
            } else {
                window.location.replace(redirect);
            }
        }).catch(function (error) {
            message('login-message', error.message, true);
        }).finally(function () { busy('login-submit', false, 'Log in →'); });
    }

    function requestSignup(event) {
        event.preventDefault();
        pendingEmail = value('signup-email').toLowerCase();
        if (!pendingEmail) return message('signup-message', 'Enter your email address.', true);
        busy('signup-submit', true, 'Sending…');
        auth.post({ action: 'request_signup_otp', email: pendingEmail }).then(function (data) {
            challengeId = data.challengeId;
            otpPurpose = 'signup';
            setText('otp-destination', data.maskedEmail || pendingEmail);
            show('otp-view', true, 2);
            clearOtp();
        }).catch(function (error) {
            message('signup-message', error.message, true);
        }).finally(function () { busy('signup-submit', false, 'Send verification code →'); });
    }

    function verifyOtp(event) {
        event.preventDefault();
        var code = otpValue();
        if (code.length !== 6) return message('otp-message', 'Enter the complete 6-digit code.', true);
        var action = otpPurpose === 'inactive' ? 'verify_inactive_otp' :
            otpPurpose === 'recovery' ? 'verify_recovery_otp' : 'verify_signup_otp';
        busy('otp-submit', true, 'Verifying…');
        auth.post({ action: action, challengeId: challengeId, code: code }).then(function () {
            if (otpPurpose === 'signup') show('credentials-view', true, 3);
            else if (otpPurpose === 'recovery') show('reset-view', false);
            else window.location.replace(redirect);
        }).catch(function (error) {
            message('otp-message', error.message, true);
            shakeOtp();
        }).finally(function () { busy('otp-submit', false, 'Verify →'); });
    }

    function createAccount(event) {
        event.preventDefault();
        var username = value('new-username');
        var password = value('new-password');
        var confirm = value('confirm-password');
        if (password !== confirm) return message('credentials-message', 'Passwords do not match.', true);
        busy('credentials-submit', true, 'Creating account…');
        auth.post({ action: 'create_account', challengeId: challengeId, username: username, password: password }).then(function () {
            window.location.replace(redirect);
        }).catch(function (error) {
            message('credentials-message', error.message, true);
        }).finally(function () { busy('credentials-submit', false, 'Create account →'); });
    }

    function requestRecovery(event) {
        event.preventDefault();
        pendingIdentifier = value('recovery-identifier');
        if (!pendingIdentifier) return message('recovery-message', 'Enter your username or email.', true);
        busy('recovery-submit', true, 'Sending…');
        auth.post({ action: 'request_recovery_otp', identifier: pendingIdentifier }).then(function (data) {
            if (!data.challengeId) {
                message('recovery-message', 'If that account exists, a code has been sent.', false);
                return;
            }
            challengeId = data.challengeId;
            otpPurpose = 'recovery';
            setText('otp-destination', data.maskedEmail || 'your email');
            show('otp-view', false);
            clearOtp();
        }).catch(function (error) {
            message('recovery-message', error.message, true);
        }).finally(function () { busy('recovery-submit', false, 'Send recovery code →'); });
    }

    function resetPassword(event) {
        event.preventDefault();
        var password = value('reset-password');
        var confirm = value('reset-confirm');
        if (password !== confirm) return message('reset-message', 'Passwords do not match.', true);
        busy('reset-submit', true, 'Saving…');
        auth.post({ action: 'reset_password', challengeId: challengeId, password: password }).then(function () {
            window.location.replace(redirect);
        }).catch(function (error) {
            message('reset-message', error.message, true);
        }).finally(function () { busy('reset-submit', false, 'Save new password →'); });
    }

    function changeUsername(event) {
        event.preventDefault();
        busy('username-submit', true, 'Saving…');
        auth.post({ action: 'change_username', username: value('account-username'), password: value('username-password') }).then(function (data) {
            setText('account-name', data.username);
            message('username-message', 'Username updated.', false);
            return auth.getSession(true);
        }).catch(function (error) { message('username-message', error.message, true); })
          .finally(function () { busy('username-submit', false, 'Change username'); });
    }

    function changePassword(event) {
        event.preventDefault();
        var next = value('account-new-password');
        if (next !== value('account-confirm-password')) return message('password-message', 'Passwords do not match.', true);
        busy('password-submit', true, 'Saving…');
        auth.post({ action: 'change_password', currentPassword: value('account-current-password'), newPassword: next }).then(function () {
            event.target.reset();
            message('password-message', 'Password updated.', false);
        }).catch(function (error) { message('password-message', error.message, true); })
          .finally(function () { busy('password-submit', false, 'Change password'); });
    }

    function requestEmailChange(event) {
        event.preventDefault();
        pendingEmail = value('account-new-email').toLowerCase();
        busy('email-submit', true, 'Sending…');
        auth.post({ action: 'request_email_change', email: pendingEmail, password: value('email-password') }).then(function (data) {
            challengeId = data.challengeId;
            setText('email-otp-destination', data.maskedEmail || pendingEmail);
            show('email-otp-view', false);
        }).catch(function (error) { message('email-message', error.message, true); })
          .finally(function () { busy('email-submit', false, 'Change email'); });
    }

    function confirmEmailChange(event) {
        event.preventDefault();
        busy('email-otp-submit', true, 'Verifying…');
        auth.post({ action: 'confirm_email_change', challengeId: challengeId, code: value('email-otp-code') }).then(function () {
            return auth.getSession(true);
        }).then(showAccount).catch(function (error) {
            message('email-otp-message', error.message, true);
        }).finally(function () { busy('email-otp-submit', false, 'Verify email →'); });
    }

    function resendOtp() {
        if (otpPurpose === 'signup') return requestSignup({ preventDefault: function () {} });
        if (otpPurpose === 'recovery') return requestRecovery({ preventDefault: function () {} });
        if (otpPurpose === 'inactive') {
            auth.post({ action: 'login', identifier: pendingIdentifier, password: pendingPassword }).then(function (data) {
                challengeId = data.challengeId;
                clearOtp();
                message('otp-message', 'A new code was sent.', false);
            }).catch(function (error) { message('otp-message', error.message, true); });
        }
    }

    function backFromOtp() {
        clearOtp();
        if (otpPurpose === 'signup') show('signup-view', true, 1);
        else if (otpPurpose === 'recovery') show('recovery-view', false);
        else show('login-view', false);
    }

    function showAccount(user) {
        if (!user) return show('login-view', false);
        setText('account-name', user.username);
        setText('account-email', user.email);
        var usernameInput = document.getElementById('account-username');
        if (usernameInput) usernameInput.value = user.username;
        show('account-view', false);
    }

    function logout(allDevices) {
        auth.logout(allDevices).then(function () {
            window.location.replace('/');
        }).catch(function (error) { message('account-message', error.message, true); });
    }

    function show(id, showProgress, step) {
        views.forEach(function (view) { view.style.display = view.id === id ? 'block' : 'none'; });
        if (progress) progress.style.display = showProgress ? 'flex' : 'none';
        if (showProgress) setProgress(step || 1);
        document.querySelectorAll('.error-msg').forEach(function (el) { el.textContent = ''; el.classList.remove('visible', 'success'); });
        var target = document.getElementById(id);
        var first = target && target.querySelector('input:not([type="hidden"])');
        if (first) window.setTimeout(function () { first.focus(); }, 50);
    }

    function setProgress(step) {
        [1, 2, 3].forEach(function (number) {
            var item = document.getElementById('auth-step-ind-' + number);
            if (!item) return;
            item.classList.toggle('active', number === step);
            item.classList.toggle('done', number < step);
            if (number === step) item.setAttribute('aria-current', 'step');
            else item.removeAttribute('aria-current');
        });
    }

    function wireOtpBoxes() {
        otpBoxes.forEach(function (box, index) {
            box.addEventListener('input', function () {
                box.value = box.value.replace(/\D/g, '').slice(-1);
                box.classList.toggle('filled', Boolean(box.value));
                if (box.value && index < otpBoxes.length - 1) otpBoxes[index + 1].focus();
                var submit = document.getElementById('otp-submit');
                if (submit) submit.disabled = otpValue().length !== 6;
            });
            box.addEventListener('keydown', function (event) {
                if (event.key === 'Backspace' && !box.value && index > 0) otpBoxes[index - 1].focus();
            });
            box.addEventListener('paste', function (event) {
                event.preventDefault();
                var digits = (event.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                digits.split('').forEach(function (digit, digitIndex) {
                    if (otpBoxes[digitIndex]) {
                        otpBoxes[digitIndex].value = digit;
                        otpBoxes[digitIndex].classList.add('filled');
                    }
                });
                var submit = document.getElementById('otp-submit');
                if (submit) submit.disabled = otpValue().length !== 6;
                if (otpBoxes[Math.min(digits.length, 6) - 1]) otpBoxes[Math.min(digits.length, 6) - 1].focus();
            });
        });
    }

    function clearOtp() {
        otpBoxes.forEach(function (box) { box.value = ''; box.classList.remove('filled', 'error'); });
        var submit = document.getElementById('otp-submit');
        if (submit) submit.disabled = true;
        if (otpBoxes[0]) window.setTimeout(function () { otpBoxes[0].focus(); }, 50);
    }

    function shakeOtp() {
        var container = document.getElementById('auth-otp-container');
        if (!container) return;
        container.classList.remove('shake');
        void container.offsetWidth;
        container.classList.add('shake');
        otpBoxes.forEach(function (box) { box.classList.add('error'); });
    }

    function otpValue() { return otpBoxes.map(function (box) { return box.value; }).join(''); }
    function value(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text || ''; }
    function bindClick(id, handler) { var el = document.getElementById(id); if (el) el.addEventListener('click', handler); }
    function bindForm(id, handler) { var el = document.getElementById(id); if (el) el.addEventListener('submit', handler); }
    function message(id, text, isError) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.add('visible');
        el.classList.toggle('success', !isError);
    }
    function busy(id, active, label) {
        var el = document.getElementById(id);
        if (!el) return;
        el.disabled = active;
        el.textContent = label;
    }
    function safeRedirect(value) {
        if (!value) return '/magazine';
        try {
            var url = new URL(value, window.location.origin);
            return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/magazine';
        } catch (error) { return '/magazine'; }
    }
})();
