function ok(res, data, message = 'ok') {
  res.json({ code: 0, message, data });
}

function fail(res, status, message, code = status) {
  res.status(status).json({ code, message, data: null });
}

module.exports = {
  ok,
  fail,
};
