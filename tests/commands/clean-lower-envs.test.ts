import { Command } from 'commander';
import { cleanLowerEnvsCommand } from '../../src/commands/clean-lower-envs';
import { Config } from '../../src/utils/config';
import { DatabaseOperations } from '../../src/utils/database';
import { EnvironmentCleanupService } from '../../src/utils/environment-cleanup';

jest.mock('../../src/utils/config');
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/environment-cleanup');

const mockConfig = Config as jest.Mocked<typeof Config>;
const mockDatabaseOperations = DatabaseOperations as jest.Mocked<typeof DatabaseOperations>;
const mockCleanupService = EnvironmentCleanupService as jest.Mocked<typeof EnvironmentCleanupService>;

describe('clean-lower-envs command', () => {
  let consoleSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    
    mockConfig.hasRequiredEnvironmentConfig
      .mockReturnValueOnce(true) // prod
      .mockReturnValueOnce(true) // dev
      .mockReturnValueOnce(true) // uat
      .mockReturnValueOnce(false); // pprd
      
    mockDatabaseOperations.testConnection.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should run in dry-run mode by default', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [],
      totalOrphanedTables: 0,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN MODE'));
    expect(mockCleanupService.performEnvironmentCleanup).not.toHaveBeenCalled();
  });

  it('should execute cleanup when --execute flag is provided', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [{
        siteId: 99,
        domain: 'orphaned.test',
        path: '/orphaned/',
        tables: ['wp_99_posts'],
      }],
      orphanedTables: [],
      totalOrphanedTables: 1,
    }];

    const mockResults = [{
      environment: 'dev',
      deletedSites: [99],
      droppedTables: ['wp_99_posts'],
      errors: [],
      duration: 1000,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport
      .mockResolvedValueOnce('Analysis report')
      .mockResolvedValueOnce('Final report');
    mockCleanupService.performEnvironmentCleanup.mockResolvedValue(mockResults);
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--execute', '--force'], { from: 'user' });

    expect(mockCleanupService.performEnvironmentCleanup).toHaveBeenCalledWith(
      'prod',
      ['dev', 'uat'], // pprd filtered out as not configured
      expect.objectContaining({
        dryRun: false,
        force: true,
      })
    );
  });

  it('should filter target environments to specific environment', async () => {
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [],
      totalOrphanedTables: 0,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--env', 'dev'], { from: 'user' });

    expect(mockCleanupService.compareEnvironments).toHaveBeenCalledWith(
      'prod',
      ['dev'],
      expect.any(Object)
    );
  });

  it('should prevent cleanup on production environment', async () => {
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--env', 'prod'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle database connection failures', async () => {
    mockDatabaseOperations.testConnection
      .mockResolvedValueOnce(true) // prod succeeds
      .mockResolvedValueOnce(false); // dev fails
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle sites-only mode', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [{
        siteId: 99,
        domain: 'orphaned.test',
        path: '/orphaned/',
        tables: ['wp_99_posts'],
      }],
      orphanedTables: [{
        tableName: 'wp_43_custom',
        siteId: 43,
      }],
      totalOrphanedTables: 2,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--sites-only'], { from: 'user' });

    expect(mockCleanupService.compareEnvironments).toHaveBeenCalledWith(
      'prod',
      ['dev', 'uat'],
      expect.objectContaining({
        sitesOnly: true,
      })
    );
  });

  it('should handle tables-only mode', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [{
        tableName: 'wp_43_custom',
        siteId: 43,
      }],
      totalOrphanedTables: 1,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--tables-only'], { from: 'user' });

    expect(mockCleanupService.compareEnvironments).toHaveBeenCalledWith(
      'prod',
      ['dev', 'uat'],
      expect.objectContaining({
        tablesOnly: true,
      })
    );
  });

  it('should handle target site filtering', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [{
        tableName: 'wp_43_custom',
        siteId: 43,
      }],
      totalOrphanedTables: 1,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--site', '43'], { from: 'user' });

    expect(mockCleanupService.compareEnvironments).toHaveBeenCalledWith(
      'prod',
      ['dev', 'uat'],
      expect.objectContaining({
        targetSite: 43,
      })
    );
  });

  it('should validate site ID is a positive number', async () => {
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--site', 'invalid'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle no cleanup needed scenario', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [],
      totalOrphanedTables: 0,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No cleanup needed'));
  });

  it('should handle verbose output', async () => {
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [],
      totalOrphanedTables: 0,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--verbose'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('database connection successful'));
  });

  it('should handle custom source environment', async () => {
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    
    const mockComparisons = [{
      environment: 'dev',
      orphanedSites: [],
      orphanedTables: [],
      totalOrphanedTables: 0,
    }];

    mockCleanupService.compareEnvironments.mockResolvedValue(mockComparisons);
    mockCleanupService.generateCleanupReport.mockResolvedValue('Test report');
    
    const program = new Command();
    program.addCommand(cleanLowerEnvsCommand);

    await program.parseAsync(['node', 'test', 'clean-lower-envs', '--source-env', 'uat'], { from: 'user' });

    expect(mockCleanupService.compareEnvironments).toHaveBeenCalledWith(
      'uat',
      ['dev', 'uat', 'pprd'],
      expect.any(Object)
    );
  });
});