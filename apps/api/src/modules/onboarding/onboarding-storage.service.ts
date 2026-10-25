import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export const ALLOWED_ONBOARDING_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface StoredDocumentResult {
  filePath: string;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadedBinaryFile {
  originalname: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
  [key: string]: any;
}

@Injectable()
export class OnboardingStorageService {
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot =
      process.env.ONBOARDING_STORAGE_DIR ||
      path.resolve(process.cwd(), 'storage', 'private', 'onboarding');

    try {
      if (!fs.existsSync(this.storageRoot)) {
        fs.mkdirSync(this.storageRoot, { recursive: true });
      }
    } catch {
      // If mkdir fails on boot, will fail-closed when attempting write
    }
  }

  getStorageRoot(): string {
    return this.storageRoot;
  }

  /**
   * Validates file size, file existence, and binary magic bytes against claimed MIME type.
   */
  validateFileSignature(
    buffer: Buffer,
    claimedMime: string,
  ): { detectedMime: string; extension: string } {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'Uploaded file cannot be empty',
      });
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds maximum allowed limit of 10MB',
      });
    }

    // 1. PDF Magic Bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const isPdf =
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d;

    // 2. PNG Magic Bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    // 3. JPEG Magic Bytes: 0xFF 0xD8 0xFF
    const isJpeg =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    // 4. WebP Magic Bytes: RIFF....WEBP (0x52 0x49 0x46 0x46 .... 0x57 0x45 0x42 0x50)
    const isWebp =
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    let detectedMime: string | null = null;
    let extension = '';

    if (isPdf) {
      detectedMime = 'application/pdf';
      extension = '.pdf';
    } else if (isPng) {
      detectedMime = 'image/png';
      extension = '.png';
    } else if (isJpeg) {
      detectedMime = 'image/jpeg';
      extension = '.jpg';
    } else if (isWebp) {
      detectedMime = 'image/webp';
      extension = '.webp';
    } else {
      throw new BadRequestException({
        code: 'INVALID_FILE_SIGNATURE',
        message:
          'File content does not match any allowed file type signature (PDF, PNG, JPEG, WebP).',
      });
    }

    const normalizedClaimed = claimedMime.toLowerCase().trim();
    const isClaimedJpeg =
      normalizedClaimed === 'image/jpeg' || normalizedClaimed === 'image/jpg';
    const isDetectedJpeg = detectedMime === 'image/jpeg';

    if (detectedMime !== normalizedClaimed && !(isClaimedJpeg && isDetectedJpeg)) {
      throw new BadRequestException({
        code: 'FORGED_MIME_TYPE',
        message: `MIME type spoofing detected: claimed '${claimedMime}' but binary signature indicates '${detectedMime}'.`,
      });
    }

    return { detectedMime, extension };
  }

  /**
   * Sanitizes original filename to prevent path traversal or special character exploits.
   */
  sanitizeOriginalFilename(filename: string): string {
    if (!filename) return 'document.pdf';
    const basename = path.basename(filename.replace(/\\/g, '/'));
    const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return sanitized.substring(0, 150) || 'document.pdf';
  }

  /**
   * Securely saves the uploaded binary file to private storage outside the webroot.
   */
  async saveDocumentFile(
    caseId: string,
    file: UploadedBinaryFile,
  ): Promise<StoredDocumentResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A binary file must be uploaded.',
      });
    }

    const { detectedMime, extension } = this.validateFileSignature(
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    const cleanFileName = this.sanitizeOriginalFilename(file.originalname);
    const randomDiskName = `${uuidv4()}${extension}`;
    const safeCaseFolder = path.basename(caseId.replace(/\\/g, '/'));
    const relativeKey = path.posix.join('cases', safeCaseFolder, randomDiskName);

    const targetDir = path.resolve(this.storageRoot, 'cases', safeCaseFolder);
    const resolvedPath = path.resolve(this.storageRoot, relativeKey);

    if (!resolvedPath.startsWith(path.resolve(this.storageRoot))) {
      throw new BadRequestException({
        code: 'PATH_TRAVERSAL_DETECTED',
        message: 'Invalid storage destination path.',
      });
    }

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.writeFile(resolvedPath, file.buffer);

    return {
      filePath: resolvedPath,
      fileKey: relativeKey,
      fileName: cleanFileName,
      fileSize: file.buffer.length,
      mimeType: detectedMime,
    };
  }

  /**
   * Resolves and streams a file from private storage for authenticated download.
   */
  async getDocumentReadStream(
    filePath: string,
    _fileKey: string,
  ): Promise<fs.ReadStream> {
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(this.storageRoot))) {
      throw new BadRequestException({
        code: 'PATH_TRAVERSAL_DETECTED',
        message: 'Access to path outside private storage root is forbidden.',
      });
    }

    try {
      await fs.promises.access(resolvedPath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND_ON_STORAGE',
        message: 'The requested document file could not be found in private storage.',
      });
    }

    return fs.createReadStream(resolvedPath);
  }
}
