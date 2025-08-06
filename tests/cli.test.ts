import { execSync } from 'child_process';

describe('wfuwp CLI', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display version', () => {
    const result = execSync(`node ${CLI_PATH} --version`, { encoding: 'utf8' });
    expect(result.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should display help', () => {
    const result = execSync(`node ${CLI_PATH} --help`, { encoding: 'utf8' });
    expect(result).toContain('CLI tool for WFU WordPress management tasks');
    expect(result).toContain('syncs3');
  });

  it('should show error for invalid command', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} invalid-command`, { stdio: 'pipe' });
    }).toThrow();
  });
});