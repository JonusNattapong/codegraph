/**
 * Directory Management
 *
 * Manages the .codegg/ directory structure for CodeGG data.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * CodeGG directory name
 */
export const CODEGG_DIR = '.codegg';

/**
 * Get the .codegg directory path for a project
 */
export function getCodeGGDir(projectRoot: string): string {
  return path.join(projectRoot, CODEGG_DIR);
}

/**
 * Check if a project has been initialized with CodeGG
 * Requires both .codegg/ directory AND codegg.db to exist
 */
export function isInitialized(projectRoot: string): boolean {
  const codeggDir = getCodeGGDir(projectRoot);
  if (!fs.existsSync(codeggDir) || !fs.statSync(codeggDir).isDirectory()) {
    return false;
  }
  // Must have codegg.db, not just .codegg folder
  const dbPath = path.join(codeggDir, 'codegg.db');
  return fs.existsSync(dbPath);
}

/**
 * Find the nearest parent directory containing .codegg/
 *
 * Walks up from the given path to find a CodeGG-initialized project,
 * similar to how git finds .git/ directories.
 *
 * @param startPath - Directory to start searching from
 * @returns The project root containing .codegg/, or null if not found
 */
export function findNearestCodeGGRoot(startPath: string): string | null {
  let current = path.resolve(startPath);
  const root = path.parse(current).root;

  while (current !== root) {
    if (isInitialized(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }

  // Check root as well
  if (isInitialized(current)) {
    return current;
  }

  return null;
}

/**
 * Create the .codegg directory structure
 * Note: Only throws if codegg.db already exists, not just if .codegg/ exists.
 */
export function createDirectory(projectRoot: string): void {
  const codeggDir = getCodeGGDir(projectRoot);
  const dbPath = path.join(codeggDir, 'codegg.db');

  // Only throw if CodeGG is actually initialized (db exists)
  // .codegg/ folder alone is fine
  if (fs.existsSync(dbPath)) {
    throw new Error(`CodeGG already initialized in ${projectRoot}`);
  }

  // Create main directory (if it doesn't exist)
  fs.mkdirSync(codeggDir, { recursive: true });

  // Create .gitignore inside .codegg (if it doesn't exist)
  const gitignorePath = path.join(codeggDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `# CodeGG data files — local to each machine, not for committing.
# Ignore everything in .codegg/ except this file itself, so transient
# files (the database, daemon.pid, sockets, logs) never show up in git.
*
!.gitignore
`;

    fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }
}

/**
 * Remove the .codegg directory
 */
export function removeDirectory(projectRoot: string): void {
  const codeggDir = getCodeGGDir(projectRoot);

  if (!fs.existsSync(codeggDir)) {
    return;
  }

  // Verify .codegg is a real directory, not a symlink pointing elsewhere
  const lstat = fs.lstatSync(codeggDir);
  if (lstat.isSymbolicLink()) {
    // Only remove the symlink itself, never follow it for recursive delete
    fs.unlinkSync(codeggDir);
    return;
  }

  if (!lstat.isDirectory()) {
    // Not a directory - remove the single file
    fs.unlinkSync(codeggDir);
    return;
  }

  // Recursively remove directory
  fs.rmSync(codeggDir, { recursive: true, force: true });
}

/**
 * Get all files in the .codegg directory
 */
export function listDirectoryContents(projectRoot: string): string[] {
  const codeggDir = getCodeGGDir(projectRoot);

  if (!fs.existsSync(codeggDir)) {
    return [];
  }

  const files: string[] = [];

  function walkDir(dir: string, prefix: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Skip symlinks to prevent following links outside .codegg
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(path.join(dir, entry.name), relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  walkDir(codeggDir);
  return files;
}

/**
 * Get the total size of the .codegg directory in bytes
 */
export function getDirectorySize(projectRoot: string): number {
  const codeggDir = getCodeGGDir(projectRoot);

  if (!fs.existsSync(codeggDir)) {
    return 0;
  }

  let totalSize = 0;

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip symlinks to prevent following links outside .codegg
      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
      }
    }
  }

  walkDir(codeggDir);
  return totalSize;
}

/**
 * Ensure a subdirectory exists within .codegg
 */
export function ensureSubdirectory(projectRoot: string, subdirName: string): string {
  if (subdirName.includes('..') || subdirName.includes(path.sep) || subdirName.includes('/')) {
    throw new Error(`Invalid subdirectory name: ${subdirName}`);
  }

  const subdirPath = path.join(getCodeGGDir(projectRoot), subdirName);

  if (!fs.existsSync(subdirPath)) {
    fs.mkdirSync(subdirPath, { recursive: true });
  }

  return subdirPath;
}

/**
 * Check if the .codegg directory has valid structure
 */
export function validateDirectory(projectRoot: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const codeggDir = getCodeGGDir(projectRoot);

  if (!fs.existsSync(codeggDir)) {
    errors.push('CodeGG directory does not exist');
    return { valid: false, errors };
  }

  if (!fs.statSync(codeggDir).isDirectory()) {
    errors.push('.codegg exists but is not a directory');
    return { valid: false, errors };
  }

  // Auto-repair missing .gitignore (non-critical file)
  const gitignorePath = path.join(codeggDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = `# CodeGG data files — local to each machine, not for committing.\n# Ignore everything in .codegg/ except this file itself, so transient\n# files (the database, daemon.pid, sockets, logs) never show up in git.\n*\n!.gitignore\n`;
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
    } catch {
      // Non-fatal: warn but don't block
      errors.push('.gitignore missing in .codegg directory and could not be created');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
