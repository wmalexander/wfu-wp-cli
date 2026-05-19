import { Command } from 'commander';

jest.mock('../../src/utils/config');
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/site-enumerator');
jest.mock('../../src/utils/backup-recovery');
jest.mock('../../src/utils/environment-cleanup');
jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: jest.fn().mockResolvedValue({
      proceed: true,
      confirmDelete: true,
      proceedWithoutBackup: true,
      confirmCleanup: true,
    }),
  },
}));

// deleteSiteCommand is a commander singleton that retains parsed option state
// across parses; re-require a fresh module graph per test to isolate it.
let deleteSiteCommand: any;
let mockConfig: any;
let mockDatabaseOperations: any;
let mockSiteEnumerator: any;
let mockCleanupService: any;

describe('delete-site command', () => {
  let consoleSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    deleteSiteCommand =
      require('../../src/commands/delete-site').deleteSiteCommand;
    mockConfig = require('../../src/utils/config').Config;
    mockDatabaseOperations =
      require('../../src/utils/database').DatabaseOperations;
    mockSiteEnumerator =
      require('../../src/utils/site-enumerator').SiteEnumerator;
    mockCleanupService =
      require('../../src/utils/environment-cleanup').EnvironmentCleanupService;

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();

    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    mockDatabaseOperations.testConnection.mockResolvedValue(true);
    mockDatabaseOperations.getSiteTables.mockReturnValue([
      'wp_43_posts',
      'wp_43_options',
    ]);
    mockCleanupService.deleteSiteFromEnvironment.mockResolvedValue({
      environment: 'dev',
      deletedSites: [43],
      droppedTables: ['wp_43_posts', 'wp_43_options'],
      errors: [],
      duration: 1000,
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('inquirer').default.prompt.mockResolvedValue({
      proceed: true,
      confirmDelete: true,
      proceedWithoutBackup: true,
      confirmCleanup: true,
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should validate site ID is a positive number', async () => {
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', 'invalid', 'dev']);

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should prevent deletion from production environment', async () => {
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'prod']);

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should validate environment is configured', async () => {
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(false);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev']);

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle database connection failure', async () => {
    mockDatabaseOperations.testConnection.mockResolvedValue(false);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev']);

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle non-existent site', async () => {
    mockSiteEnumerator.getSiteInfo.mockResolvedValue(null);
    
    const program = new Command();
    program.addCommand(deleteSiteCommand);

    await program.parseAsync(['node', 'test', 'delete-site', '999', 'dev']);

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

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run']);

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

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--force']);

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

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run']);

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

    await program.parseAsync(['node', 'test', 'delete-site', '43', 'dev', '--dry-run', '--verbose']);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Database connection successful'));
  });
});