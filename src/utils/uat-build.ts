export const UAT_BASES = ['uat', 'dev', 'main'] as const;
export type UatBase = (typeof UAT_BASES)[number];

export interface UatBuildRequest {
  base: UatBase;
  with: Record<string, string>;
  requestedBy: string;
  requestedAt: string;
}

const PACKAGE_PATTERN = /^[a-z0-9-]+\/[a-z0-9._-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;

export function isUatBase(value: string): value is UatBase {
  return (UAT_BASES as readonly string[]).includes(value);
}

export function parseWith(values: string[]): Record<string, string> {
  const pinned: Record<string, string> = {};
  for (const value of values) {
    const separator = value.lastIndexOf(':');
    if (separator < 1) {
      throw new Error(`--with expects package:branch (got "${value}")`);
    }
    const rawPackage = value.slice(0, separator);
    const branch = value.slice(separator + 1);
    const pkg = rawPackage.includes('/') ? rawPackage : `wfu/${rawPackage}`;
    if (!PACKAGE_PATTERN.test(pkg) || !BRANCH_PATTERN.test(branch)) {
      throw new Error(`Invalid package or branch in --with "${value}"`);
    }
    pinned[pkg] = branch;
  }
  return pinned;
}

export function packageAlias(
  devComposer: { 'require-dev'?: Record<string, string> },
  pkg: string
): string | null {
  const constraint = devComposer['require-dev']?.[pkg] ?? '';
  const match = / as (\S+)$/.exec(constraint);
  return match ? match[1] : null;
}

export function describeRequest(request: {
  base: UatBase;
  with: Record<string, string>;
}): string {
  const baseText: Record<UatBase, string> = {
    uat: "each package's uat branch",
    dev: "each package's dev branch",
    main: 'released versions',
  };
  const pinned = Object.entries(request.with).map(
    ([pkg, branch]) => `${pkg} at ${branch}`
  );
  return (
    `${request.base} (${baseText[request.base]})` +
    (pinned.length ? ` with ${pinned.join(', ')}` : '')
  );
}

export function isDefaultRequest(request: {
  base: UatBase;
  with: Record<string, string>;
}): boolean {
  return request.base === 'uat' && Object.keys(request.with).length === 0;
}
