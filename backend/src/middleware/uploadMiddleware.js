import crypto from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const menuUploadDir = path.resolve(__dirname, '..', '..', 'uploads', 'menu');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const extensionByMimeType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Only JPEG, PNG and WebP images are allowed.');
      error.statusCode = 400;
      callback(error);
      return;
    }

    callback(null, true);
  },
});

function hasValidSignature(file) {
  const buffer = file.buffer;

  if (file.mimetype === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (file.mimetype === 'image/png') {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => buffer[index] === byte);
  }

  if (file.mimetype === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

function buildSafeFilename(mimetype) {
  return `${Date.now()}-${crypto.randomUUID()}${extensionByMimeType[mimetype]}`;
}

export async function deleteUploadedMenuImage(relativePath) {
  if (!relativePath || !relativePath.startsWith('/uploads/menu/')) {
    return;
  }

  const filename = path.basename(relativePath);
  const absolutePath = path.resolve(menuUploadDir, filename);
  const uploadRoot = `${menuUploadDir}${path.sep}`;

  if (!absolutePath.startsWith(uploadRoot)) {
    return;
  }

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function uploadMenuItemImage(req, res, next) {
  upload.single('image')(req, res, async (error) => {
    try {
      if (error) {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          error.message = 'Image size must not exceed 5 MB.';
          error.statusCode = 400;
        }

        throw error;
      }

      if (!req.file) {
        next();
        return;
      }

      if (!hasValidSignature(req.file)) {
        const signatureError = new Error('Uploaded file content does not match an allowed image format.');
        signatureError.statusCode = 400;
        throw signatureError;
      }

      await fs.mkdir(menuUploadDir, { recursive: true });
      const filename = buildSafeFilename(req.file.mimetype);
      const absolutePath = path.resolve(menuUploadDir, filename);
      const uploadRoot = `${menuUploadDir}${path.sep}`;

      if (!absolutePath.startsWith(uploadRoot)) {
        const pathError = new Error('Invalid upload path.');
        pathError.statusCode = 400;
        throw pathError;
      }

      await fs.writeFile(absolutePath, req.file.buffer, { flag: 'wx' });
      req.uploadedMenuImage = {
        relativePath: `/uploads/menu/${filename}`,
      };

      next();
    } catch (uploadError) {
      next(uploadError);
    }
  });
}
