import * as fs from 'fs';
import * as path from 'path';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Private storage for class voice recordings, built the same way as the onboarding document store: a directory outside the web root,
 * random file names chosen here (never the uploaded name), a key that is a path inside the store, and downloads only through an
 * authorised route that streams the file. The caller has already checked the content with checkAudio.
 */
@Injectable()
export class MentoringStorageService {
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.env.MENTORING_STORAGE_DIR || path.resolve(process.cwd(), 'storage', 'private', 'mentoring'));
  }

  getStorageRoot(): string {
    return this.root;
  }

  private resolveInside(key: string): string {
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) throw new BadRequestException({ code: 'PATH_TRAVERSAL_DETECTED', message: 'That path is outside private storage.' });
    return resolved;
  }

  /** Writes a recording. The folder is the class id taken from our own record; the file name is random. Returns the key to keep. */
  async saveAudio(sessionId: string, buffer: Buffer, extension: string): Promise<string> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) throw new BadRequestException('That is not a class.');
    if (!/^\.[a-z0-9]{2,5}$/.test(extension)) throw new BadRequestException('That is not a supported recording type.');
    const key = path.posix.join('class-audio', sessionId, `${uuidv4()}${extension}`);
    const target = this.resolveInside(key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, buffer, { flag: 'wx' });
    return key;
  }

  /** Removes a file this service wrote when the database refused the record. It never throws, and it only touches files inside the store. */
  async deleteQuietly(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolveInside(key));
    } catch {
      // Already gone, or outside the store: nothing more to do.
    }
  }

  async readStream(key: string, range?: { start: number; end: number }): Promise<fs.ReadStream> {
    const target = this.resolveInside(key);
    try {
      await fs.promises.access(target, fs.constants.R_OK);
    } catch {
      throw new NotFoundException({ code: 'FILE_NOT_FOUND_ON_STORAGE', message: 'The recording could not be found in private storage.' });
    }
    return fs.createReadStream(target, range ? { start: range.start, end: range.end } : undefined);
  }
}
