import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { isBinaryFile, isIgnoredDir } from './sanitize.js';

/**
 * Maximum total bytes to collect before truncating.
 * ~4MB ≈ roughly 1M tokens for Gemini.
 */
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * Maximum size for a single file (256KB).
 */
const MAX_FILE_BYTES = 256 * 1024;

/**
 * Recursively collect text file contents from a directory.
 *
 * Respects IGNORED_DIRS and BINARY_EXTENSIONS from sanitize.js.
 *
 * @param {string} dirPath - Absolute path to directory
 * @param {object} [options]
 * @param {number} [options.maxDepth=5] - Max recursion depth
 * @param {number} [options.currentDepth=0] - Internal depth counter
 * @returns {Promise<{ content: string, fileCount: number, truncated: boolean, skippedCount: number }>}
 */
export async function collectFiles(dirPath, options = {}) {
  const { maxDepth = 5, currentDepth = 0 } = options;

  const state = { totalBytes: 0, fileCount: 0, skippedCount: 0, truncated: false };
  const parts = [];

  await walk(dirPath, dirPath, parts, state, maxDepth, currentDepth);

  return {
    content: parts.join('\n'),
    fileCount: state.fileCount,
    truncated: state.truncated,
    skippedCount: state.skippedCount,
  };
}

async function walk(rootPath, currentPath, parts, state, maxDepth, depth) {
  if (depth > maxDepth || state.truncated) return;

  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return; // permission denied, etc.
  }

  // Sort for deterministic output
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (state.truncated) break;

    const fullPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (isIgnoredDir(entry.name)) {
        state.skippedCount++;
        continue;
      }
      await walk(rootPath, fullPath, parts, state, maxDepth, depth + 1);
      continue;
    }

    if (!entry.isFile()) continue;

    if (isBinaryFile(entry.name)) {
      state.skippedCount++;
      continue;
    }

    // Check single file size
    try {
      const fileStat = await stat(fullPath);
      if (fileStat.size > MAX_FILE_BYTES) {
        const relPath = relative(rootPath, fullPath);
        parts.push(`--- ${relPath} ---\n[File too large: ${(fileStat.size / 1024).toFixed(0)}KB, skipped]\n`);
        state.skippedCount++;
        continue;
      }
    } catch {
      continue;
    }

    // Check total bytes budget
    try {
      const content = await readFile(fullPath, 'utf-8');
      const relPath = relative(rootPath, fullPath);

      if (state.totalBytes + content.length > MAX_TOTAL_BYTES) {
        state.truncated = true;
        parts.push(`\n[TRUNCATED: Total content exceeded ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB limit. ${state.fileCount} files collected so far.]`);
        break;
      }

      parts.push(`--- ${relPath} ---\n${content}`);
      state.totalBytes += content.length;
      state.fileCount++;
    } catch {
      // Not a text file or read error — skip silently
      state.skippedCount++;
    }
  }
}
