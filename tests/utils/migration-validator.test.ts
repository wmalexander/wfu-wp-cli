import { execSync } from 'child_process';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('MigrationValidator', () => {
  let MigrationValidator: any;
  let Config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh imports
    jest.resetModules();
    
    // Mock Config module
    Config = {
      getEnvironmentConfig: jest.fn(),
      hasRequiredEnvironmentConfig: jest.fn(),
    };
    
    require('../../src/utils/config').Config = Config;
  });

  describe('validateSystemRequirements', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate all system requirements successfully', async () => {
      // Mock successful command checks
      mockExecSync
        .mockReturnValueOnce('mysql  Ver 8.0.30') // mysql --version
        .mockReturnValueOnce('mysqldump  Ver 8.0.30') // mysqldump --version
        .mockReturnValueOnce('WP-CLI 2.8.1') // wp --version
        .mockReturnValueOnce('aws-cli/2.13.0') // aws --version
        .mockReturnValueOnce('Docker version 24.0.0'); // docker --version

      const result = await MigrationValidator.validateSystemRequirements();
      
      expect(result).toEqual({
        isValid: true,
        requirements: expect.arrayContaining([
          expect.objectContaining({
            name: 'MySQL Client',
            satisfied: true,
            version: expect.any(String)
          }),
          expect.objectContaining({
            name: 'mysqldump',
            satisfied: true,
            version: expect.any(String)
          }),
          expect.objectContaining({
            name: 'WP-CLI',
            satisfied: true,
            version: expect.any(String)
          }),
          expect.objectContaining({
            name: 'AWS CLI',
            satisfied: true,
            version: expect.any(String)
          }),
          expect.objectContaining({
            name: 'Docker',
            satisfied: true,
            version: expect.any(String)
          })
        ]),
        missingRequirements: []
      });
    });

    it('should detect missing system requirements', async () => {
      // Mock failed command checks
      mockExecSync
        .mockImplementationOnce(() => { throw new Error('Command not found'); }) // mysql
        .mockReturnValueOnce('mysqldump  Ver 8.0.30') // mysqldump
        .mockImplementationOnce(() => { throw new Error('Command not found'); }) // wp
        .mockReturnValueOnce('aws-cli/2.13.0') // aws
        .mockReturnValueOnce('Docker version 24.0.0'); // docker

      const result = await MigrationValidator.validateSystemRequirements();
      
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements).toContain('MySQL Client');
      expect(result.missingRequirements).toContain('WP-CLI');
      expect(result.missingRequirements).not.toContain('mysqldump');
      expect(result.missingRequirements).not.toContain('AWS CLI');
    });

    it('should handle version extraction', async () => {
      mockExecSync
        .mockReturnValueOnce('mysql  Ver 8.0.30-0ubuntu0.20.04.2 for Linux on x86_64')
        .mockReturnValueOnce('mysqldump  Ver 8.0.30-0ubuntu0.20.04.2 for Linux on x86_64')
        .mockReturnValueOnce('WP-CLI 2.8.1')
        .mockReturnValueOnce('aws-cli/2.13.0 Python/3.11.4 Linux/5.4.0-74-generic exe/x86_64.ubuntu.20')
        .mockReturnValueOnce('Docker version 24.0.0, build 98fdcd7');

      const result = await MigrationValidator.validateSystemRequirements();
      
      const mysqlReq = result.requirements.find((req: any) => req.name === 'MySQL Client');
      expect(mysqlReq?.version).toBe('8.0.30');
      
      const awsReq = result.requirements.find((req: any) => req.name === 'AWS CLI');
      expect(awsReq?.version).toBe('2.13.0');
    });
  });

  describe('validateDatabaseConnections', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate all database connections successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock successful connection tests
      mockExecSync.mockReturnValue('1'); // SELECT 1 query

      const environments = ['dev', 'uat', 'pprd', 'prod'];
      const result = await MigrationValidator.validateDatabaseConnections(environments);
      
      expect(result).toEqual({
        isValid: true,
        connections: expect.arrayContaining(
          environments.map(env => expect.objectContaining({
            environment: env,
            connected: true,
            error: null
          }))
        ),
        failedConnections: []
      });
    });

    it('should detect failed database connections', async () => {
      Config.hasRequiredEnvironmentConfig
        .mockReturnValueOnce(true) // dev
        .mockReturnValueOnce(false) // uat - not configured
        .mockReturnValueOnce(true) // pprd
        .mockReturnValueOnce(true); // prod

      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock connection results
      mockExecSync
        .mockReturnValueOnce('1') // dev - success
        .mockImplementationOnce(() => { throw new Error('Connection failed'); }) // pprd - fail
        .mockReturnValueOnce('1'); // prod - success

      const environments = ['dev', 'uat', 'pprd', 'prod'];
      const result = await MigrationValidator.validateDatabaseConnections(environments);
      
      expect(result.isValid).toBe(false);
      expect(result.failedConnections).toContain('uat');
      expect(result.failedConnections).toContain('pprd');
      expect(result.failedConnections).not.toContain('dev');
      expect(result.failedConnections).not.toContain('prod');
    });
  });

  describe('validateMigrationPermissions', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate database permissions successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock permission checks
      mockExecSync
        .mockReturnValueOnce('SELECT,INSERT,UPDATE,DELETE,CREATE,DROP,INDEX,ALTER') // SHOW GRANTS
        .mockReturnValueOnce('test_table') // CREATE TABLE test
        .mockReturnValueOnce('') // DROP TABLE test
        .mockReturnValueOnce('1') // INSERT test
        .mockReturnValueOnce('1'); // SELECT test

      const result = await MigrationValidator.validateMigrationPermissions('prod');
      
      expect(result).toEqual({
        isValid: true,
        permissions: expect.objectContaining({
          select: true,
          insert: true,
          update: true,
          delete: true,
          create: true,
          drop: true,
          alter: true
        }),
        missingPermissions: []
      });
    });

    it('should detect missing database permissions', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock limited permissions
      mockExecSync
        .mockReturnValueOnce('SELECT,INSERT,UPDATE') // SHOW GRANTS - missing CREATE, DROP, etc.
        .mockImplementationOnce(() => { throw new Error('Access denied'); }); // CREATE TABLE fails

      const result = await MigrationValidator.validateMigrationPermissions('prod');
      
      expect(result.isValid).toBe(false);
      expect(result.missingPermissions).toContain('CREATE');
      expect(result.missingPermissions).toContain('DROP');
      expect(result.missingPermissions).toContain('ALTER');
    });
  });

  describe('validateCompatibility', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate environment compatibility successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock environment information
      mockExecSync
        .mockReturnValueOnce('8.0.30') // MySQL version
        .mockReturnValueOnce('utf8mb4_unicode_ci') // charset/collation
        .mockReturnValueOnce('wp_blogs\nwp_site\nwp_sitemeta') // tables
        .mockReturnValueOnce('8.0.30') // MySQL version target
        .mockReturnValueOnce('utf8mb4_unicode_ci') // charset/collation target
        .mockReturnValueOnce('wp_blogs\nwp_site\nwp_sitemeta'); // tables target

      const result = await MigrationValidator.validateCompatibility('prod', 'uat');
      
      expect(result).toEqual({
        isCompatible: true,
        compatibility: expect.objectContaining({
          mysqlVersion: true,
          charset: true,
          networkTables: true
        }),
        incompatibilities: []
      });
    });

    it('should detect environment incompatibilities', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock incompatible environments
      mockExecSync
        .mockReturnValueOnce('8.0.30') // MySQL version source
        .mockReturnValueOnce('utf8mb4_unicode_ci') // charset source
        .mockReturnValueOnce('wp_blogs\nwp_site\nwp_sitemeta') // tables source
        .mockReturnValueOnce('5.7.40') // MySQL version target (older)
        .mockReturnValueOnce('latin1_swedish_ci') // charset target (different)
        .mockReturnValueOnce('wp_blogs'); // tables target (missing tables)

      const result = await MigrationValidator.validateCompatibility('prod', 'uat');
      
      expect(result.isCompatible).toBe(false);
      expect(result.incompatibilities).toContain('MySQL version mismatch');
      expect(result.incompatibilities).toContain('Charset/collation mismatch');
      expect(result.incompatibilities).toContain('Missing network tables');
    });
  });

  describe('validateS3Access', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate S3 access successfully', async () => {
      // Mock successful AWS CLI commands
      mockExecSync
        .mockReturnValueOnce('') // aws s3 ls bucket
        .mockReturnValueOnce('test-file-123') // aws s3 cp test file
        .mockReturnValueOnce(''); // aws s3 rm test file

      const result = await MigrationValidator.validateS3Access('test-bucket', 'us-east-1');
      
      expect(result).toEqual({
        isValid: true,
        permissions: expect.objectContaining({
          read: true,
          write: true,
          delete: true
        }),
        bucket: 'test-bucket',
        region: 'us-east-1'
      });
    });

    it('should detect S3 access issues', async () => {
      // Mock failed AWS CLI commands
      mockExecSync
        .mockReturnValueOnce('') // aws s3 ls bucket - success
        .mockImplementationOnce(() => { throw new Error('Access denied'); }) // write test fails
        .mockReturnValueOnce(''); // delete test - success

      const result = await MigrationValidator.validateS3Access('test-bucket', 'us-east-1');
      
      expect(result.isValid).toBe(false);
      expect(result.permissions.read).toBe(true);
      expect(result.permissions.write).toBe(false);
      expect(result.permissions.delete).toBe(true);
    });

    it('should handle non-existent bucket', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('The specified bucket does not exist');
      });

      const result = await MigrationValidator.validateS3Access('nonexistent-bucket', 'us-east-1');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('bucket does not exist');
    });
  });

  describe('validateSiteConsistency', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/migration-validator');
      MigrationValidator = module.MigrationValidator;
    });

    it('should validate site consistency successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock site queries
      mockExecSync
        .mockReturnValueOnce('1\t2\t3') // source sites
        .mockReturnValueOnce('1\t2\t3'); // target sites

      const result = await MigrationValidator.validateSiteConsistency([1, 2, 3], 'prod', 'uat');
      
      expect(result).toEqual({
        isConsistent: true,
        siteValidation: expect.arrayContaining([
          expect.objectContaining({
            siteId: 1,
            existsInSource: true,
            existsInTarget: true
          }),
          expect.objectContaining({
            siteId: 2,
            existsInSource: true,
            existsInTarget: true
          }),
          expect.objectContaining({
            siteId: 3,
            existsInSource: true,
            existsInTarget: true
          })
        ]),
        missingSites: []
      });
    });

    it('should detect missing sites in environments', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock site queries with missing sites
      mockExecSync
        .mockReturnValueOnce('1\t3') // source sites (missing 2)
        .mockReturnValueOnce('1\t2'); // target sites (missing 3)

      const result = await MigrationValidator.validateSiteConsistency([1, 2, 3], 'prod', 'uat');
      
      expect(result.isConsistent).toBe(false);
      expect(result.missingSites).toContain(2); // missing in source
      expect(result.missingSites).toContain(3); // missing in target
      expect(result.missingSites).not.toContain(1); // exists in both
    });
  });
});