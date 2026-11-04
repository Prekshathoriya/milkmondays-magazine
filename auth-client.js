(function () {
    'use strict';

    var endpoint = '/api/auth';
    var sessionPromise = null;
    var currentUser = null;

    function request(body) {
        return fetch(endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(readResponse);
    }

    function readResponse(response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok || data.ok === false) {
                var error = new Error(data.error || 'Please try again.');
                error.status = response.status;
                throw error;
            }
            return data;
        });
    }

    function syncUser(user) {
        currentUser = user || null;
        try {
            if (currentUser) {
                localStorage.setItem('mm_user_email', currentUser.email || '');
                localStorage.setItem('mm_user_name', currentUser.username || '');
                localStorage.setItem('mm_account_user', 'true');
            }
        } catch (error) {}
        try {
            window.dispatchEvent(new CustomEvent('mm:auth-change', { detail: { user: currentUser } }));
        } catch (error) {}
        return currentUser;
    }

    function getSession(force) {
        if (force || !sessionPromise) {
            sessionPromise = fetch(endpoint, {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            }).then(readResponse).then(function (data) {
                return syncUser(data.authenticated ? data.user : null);
            }).catch(function () {
                syncUser(null);
                return null;
            });
        }
        return sessionPromise;
    }

    function post(body) {
        return request(body).then(function (data) {
            if (data.authenticated && data.user) {
                syncUser(data.user);
                sessionPromise = Promise.resolve(data.user);
            }
            return data;
        });
    }

    function logout(allDevices) {
        return post({ action: allDevices ? 'logout_all' : 'logout' }).then(function (data) {
            syncUser(null);
            try {
                localStorage.removeItem('mm_gate_passed');
                localStorage.removeItem('mm_user_email');
                localStorage.removeItem('mm_user_name');
                localStorage.removeItem('mm_account_user');
            } catch (error) {}
            sessionPromise = Promise.resolve(null);
            return data;
        });
    }

    window.MilkMondaysAuth = {
        getSession: getSession,
        getUser: function () { return currentUser; },
        post: post,
        logout: logout
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { getSession(false); }, { once: true });
    } else {
        getSession(false);
    }
})();
