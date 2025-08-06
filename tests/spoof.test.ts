import { execSync } from 'child_process';

describe('wfuwp spoof command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${CLI_PATH} spoof --help`, { encoding: 'utf8' });
    expect(result).toContain('Spoof DNS for a WFU subdomain by adding an entry to /etc/hosts');
    expect(result).toContain('subdomain');
    expect(result).toContain('--env');
    expect(result).toContain('sudo');
  });

  it('should show error when no subdomain provided', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} spoof`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should show sudo error when not run as root', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} spoof test`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should include examples in help text', () => {
    const result = execSync(`node ${CLI_PATH} spoof --help`, { encoding: 'utf8' });
    expect(result).toContain('Examples:');
    expect(result).toContain('sudo wfuwp spoof shoes');
    expect(result).toContain('sudo wfuwp spoof tennis --env dev');
  });
});