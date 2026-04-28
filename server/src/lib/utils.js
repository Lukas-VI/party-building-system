function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function errorWithStatus(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  now,
  parseJson,
  errorWithStatus,
};
