import { existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { isGitRepository } from './git-operations';

export interface DiscoveredRepos {
  muPlugins: string[];
  plugins: string[];
  themes: string[];
  wpContentPath: string;
}

export interface RepoFilter {
  muPlugins?: boolean;
  plugins?: boolean;
  themes?: boolean;
}

export function findWpContentPath(startPath: string): string | null {
  let currentPath = startPath;
  const maxDepth = 10;
  let depth = 0;
  while (depth < maxDepth) {
    if (basename(currentPath) === 'wp-content') {
      return currentPath;
    }
    const wpContentChild = join(currentPath, 'wp-content');
    if (existsSync(wpContentChild) && statSync(wpContentChild).isDirectory()) {
      return wpContentChild;
    }
    const parent = dirname(currentPath);
    if (parent === currentPath) {
      break;
    }
    currentPath = parent;
    depth++;
  }
  return null;
}

function getDirectories(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .filter((dirent) => !dirent.name.startsWith('.'))
      .map((dirent) => dirent.name)
      .sort();
  } catch {
    return [];
  }
}

async function filterGitRepos(
  basePath: string,
  directories: string[]
): Promise<string[]> {
  const gitRepos: string[] = [];
  for (const dir of directories) {
    const fullPath = join(basePath, dir);
    if (await isGitRepository(fullPath)) {
      gitRepos.push(fullPath);
    }
  }
  return gitRepos;
}

export async function discoverRepositories(
  wpContentPath: string,
  filter?: RepoFilter
): Promise<DiscoveredRepos> {
  const result: DiscoveredRepos = {
    muPlugins: [],
    plugins: [],
    themes: [],
    wpContentPath,
  };
  const includeAll =
    !filter || (!filter.muPlugins && !filter.plugins && !filter.themes);
  if (includeAll || filter?.muPlugins) {
    const muPluginsPath = join(wpContentPath, 'mu-plugins');
    const muPluginDirs = getDirectories(muPluginsPath);
    result.muPlugins = await filterGitRepos(muPluginsPath, muPluginDirs);
  }
  if (includeAll || filter?.plugins) {
    const pluginsPath = join(wpContentPath, 'plugins');
    const allPluginDirs = getDirectories(pluginsPath);
    const wfuPluginDirs = allPluginDirs.filter((dir) => dir.startsWith('wfu-'));
    result.plugins = await filterGitRepos(pluginsPath, wfuPluginDirs);
  }
  if (includeAll || filter?.themes) {
    const themesPath = join(wpContentPath, 'themes');
    const themeDirs = getDirectories(themesPath);
    result.themes = await filterGitRepos(themesPath, themeDirs);
  }
  return result;
}

export function getTotalRepoCount(repos: DiscoveredRepos): number {
  return repos.muPlugins.length + repos.plugins.length + repos.themes.length;
}
