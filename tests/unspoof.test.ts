import { execSync } from 'child_process';

describe('wfuwp unspoof command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${CLI_PATH} unspoof --help`, { encoding: 'utf8' });
    expect(result).toContain('Remove all WFU DNS spoofing entries from /etc/hosts');
    expect(result).toContain('sudo');
  });

  it('should show sudo error when not run as root', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} unspoof`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should include examples in help text', () => {
    const result = execSync(`node ${CLI_PATH} unspoof --help`, { encoding: 'utf8' });
    expect(result).toContain('Examples:');
    expect(result).toContain('sudo wfuwp unspoof');
  });
});