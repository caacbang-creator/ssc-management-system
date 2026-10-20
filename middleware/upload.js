// Photo uploads with multer (decision C13). Used only by officer routes, AFTER requireRole,
// so nobody without the right role can send a file.
// Safety rules:
//   - only JPG, PNG and WebP, checked twice: the browser's type AND the file's first bytes
//   - at most 10 files per upload, 5 MB each
//   - the server picks the file name; the user's file name is never used
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_FILES = 10;
const MAX_SIZE = 5 * 1024 * 1024;
const EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// folder: 'events' or 'news' -> files are saved in public/uploads/<folder>/
function photoUpload(folder) {
  const dir = path.join(__dirname, '..', 'public', 'uploads', folder);
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      // e.g. 1761000000000-3f9a1c2b7d4e.jpg (time + random, so names never clash)
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXTENSIONS[file.mimetype]}`);
      }
    }),
    limits: { fileSize: MAX_SIZE, files: MAX_FILES },
    // Wrong type: skip the file (not saved) and count it, so the route can say so
    fileFilter: (req, file, cb) => {
      if (EXTENSIONS[file.mimetype]) return cb(null, true);
      req.skippedFiles = (req.skippedFiles || 0) + 1;
      cb(null, false);
    }
  });

  // multer's own errors (too big, too many) become a message in req.uploadError,
  // so the route can show it on the form with status 422 instead of a 500 page
  return (req, res, next) => {
    upload.array('photos', MAX_FILES)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        req.uploadError = err.code === 'LIMIT_FILE_SIZE'
          ? 'Each photo must be 5 MB or smaller.'
          : `Upload at most ${MAX_FILES} photos at a time.`;
        return next();
      }
      next(err);
    });
  };
}

// The browser's type can be faked, so look at the first bytes of each saved file.
// Real JPG, PNG and WebP files always start with these "magic numbers".
function isRealImage(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const bytes = Buffer.alloc(12);
  fs.readSync(fd, bytes, 0, 12, 0);
  fs.closeSync(fd);
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.toString('hex', 0, 8) === '89504e470d0a1a0a';
  const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return jpg || png || webp;
}

// Deletes uploaded files we are not keeping (fake images, or the request was refused)
function removeFiles(files) {
  (files || []).forEach((file) => fs.rm(file.path, { force: true }, () => {}));
}

// Deletes a photo file from disk, but ONLY if it was uploaded (lives in /uploads/).
// Photos the team added to public/img or public/newsimg are part of the repository and stay.
function removeUploadedPhoto(filePath) {
  if (!filePath.startsWith('/uploads/')) return;
  const fullPath = path.join(__dirname, '..', 'public', filePath);
  fs.rm(fullPath, { force: true }, () => {});
}

module.exports = { photoUpload, isRealImage, removeFiles, removeUploadedPhoto, MAX_FILES };
