import { execSync } from 'child_process';

describe('wfuwp local command', () => {
  const CLI_PATH = './bin/wfuwp';

  describe('main command', () => {
    it('should display help when --help flag is used', () => {
      const result = execSync(`node ${CLI_PATH} local --help`, { encoding: 'utf8' });
      expect(result).toContain('Manage local development environment for WFU WordPress sites');
      expect(result).toContain('domain');
      expect(result).toContain('status');
      expect(result).toContain('install');
      expect(result).toContain('Available Subcommands:');
    });

    it('should show available subcommands with completion status', () => {
      const result = execSync(`node ${CLI_PATH} local --help`, { encoding: 'utf8' });
      expect(result).toContain('✓'); // Check marks for completed phases
      expect(result).toContain('domain');
      expect(result).toContain('status');
      expect(result).toContain('install');
      expect(result).toContain('start');
      expect(result).toContain('stop');
      expect(result).toContain('restart');
      expect(result).toContain('refresh');
      expect(result).toContain('reset');
      expect(result).toContain('config');
    });

    it('should include examples in help text', () => {
      const result = execSync(`node ${CLI_PATH} local --help`, { encoding: 'utf8' });
      expect(result).toContain('Examples:');
      expect(result).toContain('sudo wfuwp local domain add 43');
      expect(result).toContain('wfuwp local status');
      expect(result).toContain('sudo wfuwp local domain remove 43');
    });

    it('should include sudo note for domain management', () => {
      const result = execSync(`node ${CLI_PATH} local --help`, { encoding: 'utf8' });
      expect(result).toContain('Domain management requires sudo privileges');
      expect(result).toContain('/etc/hosts');
    });
  });

  describe('domain subcommand', () => {
    it('should display domain help', () => {
      const result = execSync(`node ${CLI_PATH} local domain --help`, { encoding: 'utf8' });
      expect(result).toContain('Manage local development domains');
      expect(result).toContain('add');
      expect(result).toContain('remove');
      expect(result).toContain('list');
      expect(result).toContain('reset');
    });

    it('should show domain add help with site-id parameter', () => {
      const result = execSync(`node ${CLI_PATH} local domain add --help`, { encoding: 'utf8' });
      expect(result).toContain('Add local development domain for a WordPress site');
      expect(result).toContain('site-id');
      expect(result).toContain('--port');
    });

    it('should show domain remove help with site-id parameter', () => {
      const result = execSync(`node ${CLI_PATH} local domain remove --help`, { encoding: 'utf8' });
      expect(result).toContain('Remove local development domain for a WordPress site');
      expect(result).toContain('site-id');
    });

    it('should show domain list help', () => {
      const result = execSync(`node ${CLI_PATH} local domain list --help`, { encoding: 'utf8' });
      expect(result).toContain('List all configured local development domains');
    });

    it('should show domain reset help', () => {
      const result = execSync(`node ${CLI_PATH} local domain reset --help`, { encoding: 'utf8' });
      expect(result).toContain('Remove all local development domains');
    });

    it('should show error when domain add called without site-id', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local domain add`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should show error when domain remove called without site-id', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local domain remove`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should show sudo requirement error when not run as root', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local domain add 43`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should validate site-id format for domain add', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local domain add invalid`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should validate site-id format for domain remove', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local domain remove invalid`, { stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('status subcommand', () => {
    it('should display status help', () => {
      const result = execSync(`node ${CLI_PATH} local status --help`, { encoding: 'utf8' });
      expect(result).toContain('Show local development environment status');
      expect(result).toContain('--verbose');
    });

    it('should run status check without errors', () => {
      const result = execSync(`node ${CLI_PATH} local status`, { 
        encoding: 'utf8',
        timeout: 30000 // Allow 30 seconds for status check
      });
      expect(result).toContain('Local Development Environment Status');
      expect(result).toContain('Overall Status');
      expect(result).toContain('Core Dependencies');
    });

    it('should show verbose information when --verbose flag used', () => {
      const result = execSync(`node ${CLI_PATH} local status --verbose`, { 
        encoding: 'utf8',
        timeout: 30000
      });
      expect(result).toContain('Local Development Environment Status');
      expect(result).toContain('Core Dependencies');
      expect(result).toContain('Docker');
      expect(result).toContain('DDEV');
    });

    it('should show dependency status information', () => {
      const result = execSync(`node ${CLI_PATH} local status`, { 
        encoding: 'utf8',
        timeout: 30000
      });
      expect(result).toContain('Docker');
      expect(result).toContain('DDEV');
      expect(result).toContain('System Tools');
    });
  });

  describe('install subcommand', () => {
    it('should display install help', () => {
      const result = execSync(`node ${CLI_PATH} local install --help`, { encoding: 'utf8' });
      expect(result).toContain('Install and setup local development dependencies');
      expect(result).toContain('--force');
      expect(result).toContain('docker');
      expect(result).toContain('ddev');
      expect(result).toContain('workspace');
      expect(result).toContain('database');
    });

    it('should show available install targets', () => {
      const result = execSync(`node ${CLI_PATH} local install --help`, { encoding: 'utf8' });
      expect(result).toContain('docker');
      expect(result).toContain('ddev');
      expect(result).toContain('mkcert');
      expect(result).toContain('workspace');
      expect(result).toContain('database');
    });

    it('should show docker install help', () => {
      const result = execSync(`node ${CLI_PATH} local install docker --help`, { encoding: 'utf8' });
      expect(result).toContain('Install Docker for local development');
    });

    it('should show ddev install help', () => {
      const result = execSync(`node ${CLI_PATH} local install ddev --help`, { encoding: 'utf8' });
      expect(result).toContain('Install DDEV local development environment');
    });

    it('should show workspace setup help', () => {
      const result = execSync(`node ${CLI_PATH} local install workspace --help`, { encoding: 'utf8' });
      expect(result).toContain('Setup local development workspace');
    });

    it('should show database setup help', () => {
      const result = execSync(`node ${CLI_PATH} local install database --help`, { encoding: 'utf8' });
      expect(result).toContain('Download and setup database from S3');
      expect(result).toContain('--environment');
    });
  });

  describe('start subcommand', () => {
    it('should display start help', () => {
      const result = execSync(`node ${CLI_PATH} local start --help`, { encoding: 'utf8' });
      expect(result).toContain('Start local development environment');
      expect(result).toContain('--all');
      expect(result).toContain('project-name');
    });

    it('should show examples in help text', () => {
      const result = execSync(`node ${CLI_PATH} local start --help`, { encoding: 'utf8' });
      expect(result).toContain('Examples:');
      expect(result).toContain('wfuwp local start site43');
      expect(result).toContain('wfuwp local start 43');
      expect(result).toContain('wfuwp local start --all');
    });
  });

  describe('stop subcommand', () => {
    it('should display stop help', () => {
      const result = execSync(`node ${CLI_PATH} local stop --help`, { encoding: 'utf8' });
      expect(result).toContain('Stop local development environment');
      expect(result).toContain('--all');
      expect(result).toContain('project-name');
    });

    it('should show examples in help text', () => {
      const result = execSync(`node ${CLI_PATH} local stop --help`, { encoding: 'utf8' });
      expect(result).toContain('Examples:');
      expect(result).toContain('wfuwp local stop site43');
      expect(result).toContain('wfuwp local stop 43');
      expect(result).toContain('wfuwp local stop --all');
    });
  });

  describe('restart subcommand', () => {
    it('should display restart help', () => {
      const result = execSync(`node ${CLI_PATH} local restart --help`, { encoding: 'utf8' });
      expect(result).toContain('Restart local development environment');
      expect(result).toContain('--all');
      expect(result).toContain('project-name');
    });

    it('should show examples in help text', () => {
      const result = execSync(`node ${CLI_PATH} local restart --help`, { encoding: 'utf8' });
      expect(result).toContain('Examples:');
      expect(result).toContain('wfuwp local restart site43');
      expect(result).toContain('wfuwp local restart 43');
      expect(result).toContain('wfuwp local restart --all');
    });
  });

  describe('refresh subcommand', () => {
    it('should display refresh help', () => {
      const result = execSync(`node ${CLI_PATH} local refresh --help`, { encoding: 'utf8' });
      expect(result).toContain('Refresh local development content');
      expect(result).toContain('database');
      expect(result).toContain('build');
    });

    it('should show database refresh help', () => {
      const result = execSync(`node ${CLI_PATH} local refresh database --help`, { encoding: 'utf8' });
      expect(result).toContain('Refresh database from production S3 backup');
      expect(result).toContain('--environment');
      expect(result).toContain('--no-backup');
    });

    it('should show build refresh help', () => {
      const result = execSync(`node ${CLI_PATH} local refresh build --help`, { encoding: 'utf8' });
      expect(result).toContain('Run build operations');
      expect(result).toContain('--no-composer');
      expect(result).toContain('--no-npm');
    });
  });

  describe('reset subcommand', () => {
    it('should display reset help', () => {
      const result = execSync(`node ${CLI_PATH} local reset --help`, { encoding: 'utf8' });
      expect(result).toContain('Reset local development environment');
      expect(result).toContain('--deep');
      expect(result).toContain('--backup-dir');
      expect(result).toContain('project-name');
    });

    it('should show examples in help text', () => {
      const result = execSync(`node ${CLI_PATH} local reset --help`, { encoding: 'utf8' });
      expect(result).toContain('Examples:');
      expect(result).toContain('wfuwp local reset site43');
      expect(result).toContain('wfuwp local reset site43 --deep');
    });

    it('should warn about destructive operation', () => {
      const result = execSync(`node ${CLI_PATH} local reset --help`, { encoding: 'utf8' });
      expect(result.includes('WARNING') || result.includes('destructive')).toBe(true);
    });
  });

  describe('config subcommand', () => {
    it('should display config help', () => {
      const result = execSync(`node ${CLI_PATH} local config --help`, { encoding: 'utf8' });
      expect(result).toContain('Configure local development settings');
      expect(result).toContain('wizard');
      expect(result).toContain('get');
      expect(result).toContain('set');
      expect(result).toContain('show');
      expect(result).toContain('reset');
    });

    it('should show config wizard help', () => {
      const result = execSync(`node ${CLI_PATH} local config wizard --help`, { encoding: 'utf8' });
      expect(result).toContain('Run interactive configuration wizard');
    });

    it('should show config get help', () => {
      const result = execSync(`node ${CLI_PATH} local config get --help`, { encoding: 'utf8' });
      expect(result).toContain('Get configuration setting value');
      expect(result).toContain('setting-name');
    });

    it('should show config set help', () => {
      const result = execSync(`node ${CLI_PATH} local config set --help`, { encoding: 'utf8' });
      expect(result).toContain('Set configuration setting value');
      expect(result).toContain('setting-name');
      expect(result).toContain('value');
    });

    it('should show config show help', () => {
      const result = execSync(`node ${CLI_PATH} local config show --help`, { encoding: 'utf8' });
      expect(result).toContain('Show all configuration settings');
    });

    it('should show available configuration settings', () => {
      const result = execSync(`node ${CLI_PATH} local config --help`, { encoding: 'utf8' });
      expect(result).toContain('workspaceDir');
      expect(result).toContain('defaultPort');
      expect(result).toContain('defaultEnvironment');
    });

    it('should show error when config get called without setting name', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local config get`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should show error when config set called without parameters', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local config set`, { stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('error handling', () => {
    it('should show error for invalid subcommand', () => {
      expect(() => {
        execSync(`node ${CLI_PATH} local invalid-subcommand`, { stdio: 'pipe' });
      }).toThrow();
    });

    it('should show helpful error message for invalid subcommand', () => {
      try {
        execSync(`node ${CLI_PATH} local invalid-subcommand`, { stdio: 'pipe' });
        fail('Should have thrown an error');
      } catch (error: any) {
        const stderr = error.stderr?.toString() || '';
        const stdout = error.stdout?.toString() || '';
        const output = stderr + stdout;
        
        expect(output.includes('error') || output.includes('unknown')).toBe(true);
      }
    });
  });

  describe('integration', () => {
    it('should list local command in main help', () => {
      const result = execSync(`node ${CLI_PATH} --help`, { encoding: 'utf8' });
      expect(result).toContain('local');
    });

    it('should show local command description in main help', () => {
      const result = execSync(`node ${CLI_PATH} --help`, { encoding: 'utf8' });
      expect(result).toContain('local');
      expect(result.includes('development') || result.includes('environment')).toBe(true);
    });
  });
});