const { AsyncLocalStorage } = require('async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();

function setToken(token) {
  asyncLocalStorage.getStore()?.set('token', token);
}

function getToken() {
  return asyncLocalStorage.getStore()?.get('token');
}

function runWithToken(token, callback) {
  asyncLocalStorage.run(new Map(), () => {
    setToken(token);
    callback();
  });
}

module.exports = { setToken, getToken, runWithToken };
