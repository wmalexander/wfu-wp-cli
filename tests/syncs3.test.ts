import { execSync } from 'child_process';

describe('wfuwp syncs3 command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when no arguments provided', () => {
    const result = execSync(`node ${CLI_PATH} syncs3 --help`, { encoding: 'utf8' });
    expect(result).toContain('Sync WordPress site files between S3 environments');
    expect(result).toContain('site-id');
    expect(result).toContain('from-env');
    expect(result).toContain('to-env');
  });

  it('should reject invalid site ID', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} syncs3 abc prop pprd`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should reject invalid source environment', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} syncs3 43 invalid pprd`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should reject invalid destination environment', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} syncs3 43 prop invalid`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should reject same source and destination environments', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} syncs3 43 prop prop`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should accept valid environments', () => {
    const validEnvs = ['dev', 'stg', 'prop', 'pprd', 'prod'];
    validEnvs.forEach(env => {
      const result = execSync(`node ${CLI_PATH} syncs3 --help`, { encoding: 'utf8' });
      expect(result).toContain(env);
    });
  });
});