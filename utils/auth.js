const TOKEN_KEY = 'dj_token';
const USER_KEY = 'dj_user';

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
}

function setToken(token) {
  wx.setStorageSync(TOKEN_KEY, token);
}

function clearToken() {
  wx.removeStorageSync(TOKEN_KEY);
}

function getUser() {
  try {
    return wx.getStorageSync(USER_KEY) || null;
  } catch (error) {
    return null;
  }
}

function setUser(user) {
  wx.setStorageSync(USER_KEY, user);
}

function clearUser() {
  wx.removeStorageSync(USER_KEY);
}

function clearAuth() {
  clearToken();
  clearUser();
}

module.exports = {
  getToken,
  setToken,
  clearToken,
  getUser,
  setUser,
  clearUser,
  clearAuth,
};
