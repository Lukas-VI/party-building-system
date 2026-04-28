const fs = require('node:fs');
const multer = require('multer');
const { env } = require('./env');

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: env.UPLOAD_DIR });

module.exports = {
  upload,
};
