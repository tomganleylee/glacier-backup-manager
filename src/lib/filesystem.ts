import fs from 'fs';
import path from 'path';
import { getSetting } from './db';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  children?: number;
}

export function getNasMountPath(): string {
  return getSetting('nas_mount_path') || '/mnt/nas';
}

export function listDirectory(dirPath: string): FileEntry[] {
  const nasMount = getNasMountPath();
  
  // Security: ensure path is within NAS mount
  const fullPath = path.resolve(nasMount, dirPath);
  if (!fullPath.startsWith(nasMount)) {
    throw new Error('Access denied: path outside NAS mount');
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Path not found: ${dirPath}`);
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  
  return entries
    .filter(e => !e.name.startsWith('.') && e.name !== '$RECYCLE.BIN')
    .map(entry => {
      const entryPath = path.join(fullPath, entry.name);
      const relativePath = path.relative(nasMount, entryPath);
      
      try {
        const stats = fs.statSync(entryPath);
        
        if (entry.isDirectory()) {
          let childCount = 0;
          let dirSize = 0;
          try {
            const children = fs.readdirSync(entryPath, { withFileTypes: true }).filter(n => !n.name.startsWith('.'));
            childCount = children.length;
            // Sum direct file children for a fast shallow size
            for (const child of children) {
              if (child.isFile()) {
                try { dirSize += fs.statSync(path.join(entryPath, child.name)).size; } catch { /* skip */ }
              }
            }
          } catch { /* permission denied */ }

          return {
            name: entry.name,
            path: relativePath,
            type: 'directory' as const,
            size: dirSize,
            modified: stats.mtime.toISOString(),
            children: childCount,
          };
        }
        
        return {
          name: entry.name,
          path: relativePath,
          type: 'file' as const,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      } catch {
        return {
          name: entry.name,
          path: relativePath,
          type: entry.isDirectory() ? 'directory' as const : 'file' as const,
          size: 0,
          modified: new Date().toISOString(),
        };
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function getDirectorySize(dirPath: string): number {
  const nasMount = getNasMountPath();
  const fullPath = path.resolve(nasMount, dirPath);
  if (!fullPath.startsWith(nasMount)) return 0;

  let totalSize = 0;
  
  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const p = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            totalSize += fs.statSync(p).size;
          } catch { /* skip */ }
        } else if (entry.isDirectory()) {
          walk(p);
        }
      }
    } catch { /* skip */ }
  }

  walk(fullPath);
  return totalSize;
}
