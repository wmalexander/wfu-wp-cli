import { Command } from 'commander';
import { deleteSiteCommand } from '../../src/commands/delete-site';
import { Config } from '../../src/utils/config';
import { DatabaseOperations } from '../../src/utils/database';
import { SiteEnumerator } from '../../src/utils/site-enumerator';
import { EnvironmentCleanupService } from '../../src/utils/environment-cleanup';

jest.mock('../../src/utils/config');
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/site-enumerator');
jest.mock('../../src/utils/backup-recovery');
jest.mock('../../src/utils/environment-cleanup');

const mockConfig = Config as jest.Mocked<typeof Config>;
const mockDatabaseOperations = DatabaseOperations as jest.Mocked<typeof DatabaseOperations>;
const mockSiteEnumerator = SiteEnumerator as jest.Mocked<typeof SiteEnumerator>;
const mockCleanupService = EnvironmentCleanupService as jest.Mocked<typeof EnvironmentCleanupService>;

describe('delete-site command', () => {
  let consoleSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    mockDatabaseOperations.testConnection.mockResolvedValue(true);
    mockDatabaseOperations.getSiteTables.mockReturnValue(['wp_43_posts', 'wp_43_options']);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should validate site ID is a positive number', async () => {
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', 'invalid', 'dev'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should prevent deletion from production environment', async () => {
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'prod'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should validate environment is configured', async () => {
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(false);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle database connection failure', async () => {
    mockDatabaseOperations.testConnection.mockResolvedValue(false);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle non-existent site', async () => {
    mockSiteEnumerator.getSiteInfo.mockResolvedValue(null);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '999', 'dev'], { from: 'user' });

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should perform dry run by default', async () => {
    const mockSiteInfo = {
      blogId: 43,
      domain: 'test.example.com',
      path: '/test/',
      registeredDate: '2023-01-01',
      lastUpdated: '2023-01-01',
      isPublic: true,
      isArchived: false,
      isMature: false,
      isSpam: false,
      isDeleted: false,
    };

    mockSiteEnumerator.getSiteInfo.mockResolvedValue(mockSiteInfo);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run'], { from: 'user' });

    expect(mockCleanupService.deleteSiteFromEnvironment).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
  });

  it('should perform actual deletion with force flag', async () => {
    const mockSiteInfo = {
      blogId: 43,
      domain: 'test.example.com',
      path: '/test/',
      registeredDate: '2023-01-01',
      lastUpdated: '2023-01-01',
      isPublic: true,
      isArchived: false,
      isMature: false,
      isSpam: false,
      isDeleted: false,
    };

    const mockResult = {
      environment: 'dev',
      deletedSites: [43],
      droppedTables: ['wp_43_posts', 'wp_43_options'],
      errors: [],
      duration: 1000,
    };

    mockSiteEnumerator.getSiteInfo.mockResolvedValue(mockSiteInfo);
    mockCleanupService.deleteSiteFromEnvironment.mockResolvedValue(mockResult);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--force'], { from: 'user' });

    expect(mockCleanupService.deleteSiteFromEnvironment).toHaveBeenCalledWith(
      43,
      'dev',
      expect.objectContaining({
        dryRun: false,
        createBackup: false,
        verbose: false,
      })
    );
  });

  it('should handle sites with no tables', async () => {
    const mockSiteInfo = {
      blogId: 43,
      domain: 'test.example.com',
      path: '/test/',
      registeredDate: '2023-01-01',
      lastUpdated: '2023-01-01',
      isPublic: true,
      isArchived: false,
      isMature: false,
      isSpam: false,
      isDeleted: false,
    };

    mockSiteEnumerator.getSiteInfo.mockResolvedValue(mockSiteInfo);
    mockDatabaseOperations.getSiteTables.mockReturnValue([]);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No tables found'));
  });

  it('should show verbose output when requested', async () => {
    const mockSiteInfo = {
      blogId: 43,
      domain: 'test.example.com',
      path: '/test/',
      registeredDate: '2023-01-01',
      lastUpdated: '2023-01-01',
      isPublic: true,
      isArchived: false,
      isMature: false,
      isSpam: false,
      isDeleted: false,
    };

    mockSiteEnumerator.getSiteInfo.mockResolvedValue(mockSiteInfo);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run', '--verbose'], { from: 'user' });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Database connection successful'));
  });
});