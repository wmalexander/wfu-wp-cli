import { readFileSync, writeFileSync } from 'fs';
import { LocalHostsManager } from '../../src/utils/local-hosts-manager';

jest.mock('fs');

const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;

const START = '# WFU WordPress CLI - Local Development Start';
const END = '# WFU WordPress CLI - Local Development End';

describe('LocalHostsManager', () => {
  let hostsContent: string;
  let getuidSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    hostsContent = '127.0.0.1\tlocalhost\n';
    mockReadFileSync.mockImplementation(() => hostsContent);
    mockWriteFileSync.mockImplementation((_path, data) => {
      hostsContent = data as string;
    });
    getuidSpy = jest.spyOn(process, 'getuid').mockReturnValue(0);
  });
  afterEach(() => {
    getuidSpy.mockRestore();
  });
  it('writes an IPv4 and an IPv6 line for each added domain', () => {
    const manager = new LocalHostsManager();
    manager.addDomain('news.wfu.local');
    expect(hostsContent).toBe(
      `127.0.0.1\tlocalhost\n${START}\n127.0.0.1\tnews.wfu.local\n::1\tnews.wfu.local\n${END}\n`
    );
  });
  it('reports each domain once even though it has two lines', () => {
    const manager = new LocalHostsManager();
    manager.addDomain('news.wfu.local');
    manager.addDomain('magazine.wfu.local');
    expect(manager.getCurrentDomains()).toEqual([
      { domain: 'news.wfu.local', ipAddress: '127.0.0.1' },
      { domain: 'magazine.wfu.local', ipAddress: '127.0.0.1' },
    ]);
  });
  it('adds the missing IPv6 line to an existing IPv4-only section', () => {
    hostsContent = `${START}\n127.0.0.1\tnews.wfu.local\n${END}\n`;
    const manager = new LocalHostsManager();
    manager.addDomain('magazine.wfu.local');
    expect(hostsContent).toContain(
      `${START}\n127.0.0.1\tnews.wfu.local\n::1\tnews.wfu.local\n127.0.0.1\tmagazine.wfu.local\n::1\tmagazine.wfu.local\n${END}\n`
    );
  });
  it('removes both lines when a domain is removed', () => {
    const manager = new LocalHostsManager();
    manager.addDomain('news.wfu.local');
    manager.addDomain('magazine.wfu.local');
    manager.removeDomain('news.wfu.local');
    expect(hostsContent).not.toContain('news.wfu.local');
    expect(hostsContent).toContain('::1\tmagazine.wfu.local');
  });
});
