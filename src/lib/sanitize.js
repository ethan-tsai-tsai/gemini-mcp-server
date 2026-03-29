import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';

/**
 * Dangerous shell metacharacters that should never appear in paths
 * passed to child_process (defense-in-depth, even though we use spawn).
 */
const SHELL_META = /[;&|`$(){}!<>]/;

/**
 * Directories and patterns to skip when traversing codebases.
 */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
]);

/**
 * Binary file extensions to skip.
 */
export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.pyc', '.pyo', '.class',
  '.db', '.sqlite', '.sqlite3',
  '.lock',
]);

/**
 * Validate and resolve an absolute filesystem path.
 * Rejects paths with shell metacharacters and verifies existence.
 *
 * @param {string} inputPath
 * @returns {Promise<string>} Resolved absolute path
 * @throws {Error} If path is invalid or does not exist
 */
export async function sanitizePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  const trimmed = inputPath.trim();

  if (SHELL_META.test(trimmed)) {
    throw new Error(`Path contains disallowed characters: ${trimmed}`);
  }

  const absolute = resolve(trimmed);

  await stat(absolute); // throws ENOENT if not found

  return absolute;
}

/**
 * Check if a filename should be skipped (binary file).
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function isBinaryFile(filename) {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

/**
 * Check if a directory name should be skipped.
 *
 * @param {string} dirName
 * @returns {boolean}
 */
export function isIgnoredDir(dirName) {
  return IGNORED_DIRS.has(dirName) || dirName.startsWith('.');
}
