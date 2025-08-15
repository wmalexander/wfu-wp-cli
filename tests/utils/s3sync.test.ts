import { execSync } from 'child_process';

// Mock dependencies
jest.mock('child_process');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('S3Sync', () => {
  let S3Sync: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh imports
    jest.resetModules();
  });

  describe('checkAwsCli', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/s3sync');
      S3Sync = module.S3Sync;
    });

    it('should return true when AWS CLI is available', () => {
      mockExecSync.mockReturnValue('aws-cli/2.13.0');
      
      const result = S3Sync.checkAwsCli();
      expect(result).toBe(true);
    });

    it('should return false when AWS CLI is not available', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });
      
      const result = S3Sync.checkAwsCli();
      expect(result).toBe(false);
    });
  });

  describe('syncWordPressFiles', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/s3sync');
      S3Sync = module.S3Sync;
    });

    it('should sync WordPress files successfully', async () => {
      mockExecSync.mockReturnValue('Completed 100 file(s) with 0 error(s)');
      
      const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat', {
        dryRun: false,
        verbose: false
      });
      
      expect(result).toEqual({
        success: true,
        filesTransferred: 100,
        message: expect.stringContaining('successfully synchronized')
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('aws s3 sync'),
        expect.any(Object)
      );
    });

    it('should perform dry run when requested', async () => {
      mockExecSync.mockReturnValue('(dryrun) upload: uploads/file1.jpg to s3://bucket/file1.jpg');
      
      const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat', {
        dryRun: true,
        verbose: false
      });
      
      expect(result.success).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--dryrun'),
        expect.any(Object)
      );
    });

    it('should show verbose output when requested', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockExecSync.mockReturnValue('Completed 50 file(s) with 0 error(s)');
      
      await S3Sync.syncWordPressFiles('123', 'prod', 'uat', {
        verbose: true
      });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WordPress Files S3 Sync')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Site ID: ')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle sync failures', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('S3 sync failed: access denied');
      });
      
      const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat');
      
      expect(result).toEqual({
        success: false,
        filesTransferred: 0,
        message: expect.stringContaining('S3 sync failed')
      });
    });

    it('should force sync when requested', async () => {
      mockExecSync.mockReturnValue('Completed 75 file(s) with 0 error(s)');
      
      await S3Sync.syncWordPressFiles('123', 'prod', 'uat', {
        force: true
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--delete'),
        expect.any(Object)
      );
    });

    it('should construct correct S3 bucket paths', async () => {
      mockExecSync.mockReturnValue('Completed 25 file(s) with 0 error(s)');
      
      await S3Sync.syncWordPressFiles('456', 'uat', 'pprd');
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('s3://wfu-cer-wordpress-uat-us-east-1/sites/456/'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('s3://wfu-cer-wordpress-pprd-us-east-1/sites/456/'),
        expect.any(Object)
      );
    });

    it('should extract file transfer count from AWS output', async () => {
      const awsOutputs = [
        'Completed 0 file(s) with 0 error(s)',
        'Completed 1 file(s) with 0 error(s)',
        'Completed 100 file(s) with 0 error(s)',
        'Completed 1,500 file(s) with 0 error(s)'
      ];
      
      const expectedCounts = [0, 1, 100, 1500];
      
      for (let i = 0; i < awsOutputs.length; i++) {
        mockExecSync.mockReturnValue(awsOutputs[i]);
        
        const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat');
        
        expect(result.filesTransferred).toBe(expectedCounts[i]);
      }
    });

    it('should handle AWS CLI output without file count', async () => {
      mockExecSync.mockReturnValue('Sync completed successfully');
      
      const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat');
      
      expect(result.success).toBe(true);
      expect(result.filesTransferred).toBe(0); // Default when count can't be extracted
    });

    it('should handle partial sync failures', async () => {
      mockExecSync.mockReturnValue('Completed 50 file(s) with 5 error(s)');
      
      const result = await S3Sync.syncWordPressFiles('123', 'prod', 'uat');
      
      expect(result.success).toBe(false); // Should be false when there are errors
      expect(result.filesTransferred).toBe(50);
      expect(result.message).toContain('5 error(s)');
    });
  });

  describe('syncMultipleSites', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/s3sync');
      S3Sync = module.S3Sync;
    });

    it('should sync multiple sites successfully', async () => {
      mockExecSync.mockReturnValue('Completed 25 file(s) with 0 error(s)');
      
      const result = await S3Sync.syncMultipleSites(
        ['1', '2', '3'],
        'prod',
        'uat',
        { verbose: false }
      );
      
      expect(result).toEqual({
        success: true,
        totalSites: 3,
        successfulSites: 3,
        failedSites: [],
        totalFilesTransferred: 75 // 25 files * 3 sites
      });
    });

    it('should handle mixed success and failure', async () => {
      mockExecSync
        .mockReturnValueOnce('Completed 25 file(s) with 0 error(s)') // Site 1 success
        .mockImplementationOnce(() => { throw new Error('Access denied'); }) // Site 2 failure
        .mockReturnValueOnce('Completed 30 file(s) with 0 error(s)'); // Site 3 success
      
      const result = await S3Sync.syncMultipleSites(
        ['1', '2', '3'],
        'prod',
        'uat',
        { verbose: false }
      );
      
      expect(result).toEqual({
        success: false, // Overall failure due to one failed site
        totalSites: 3,
        successfulSites: 2,
        failedSites: ['2'],
        totalFilesTransferred: 55 // 25 + 0 + 30
      });
    });

    it('should show progress for multiple sites', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockExecSync.mockReturnValue('Completed 10 file(s) with 0 error(s)');
      
      await S3Sync.syncMultipleSites(
        ['1', '2'],
        'prod',
        'uat',
        { verbose: true }
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Syncing site 1 of 2')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Syncing site 2 of 2')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('estimateSyncSize', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/s3sync');
      S3Sync = module.S3Sync;
    });

    it('should estimate sync size successfully', async () => {
      mockExecSync.mockReturnValue(`Total Objects: 100
Total Size: 52428800`); // 50MB
      
      const result = await S3Sync.estimateSyncSize('123', 'prod', 'uat');
      
      expect(result).toEqual({
        totalFiles: 100,
        totalSizeBytes: 52428800,
        totalSizeMB: 50,
        estimatedTimeMinutes: expect.any(Number)
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('aws s3api head-bucket'),
        expect.any(Object)
      );
    });

    it('should handle estimation failures gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Bucket does not exist');
      });
      
      const result = await S3Sync.estimateSyncSize('999', 'prod', 'uat');
      
      expect(result).toEqual({
        totalFiles: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        estimatedTimeMinutes: 0
      });
    });
  });

  describe('validateS3Buckets', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/s3sync');
      S3Sync = module.S3Sync;
    });

    it('should validate accessible buckets successfully', async () => {
      mockExecSync.mockReturnValue(''); // Successful bucket access
      
      const result = await S3Sync.validateS3Buckets(['prod', 'uat']);
      
      expect(result).toEqual({
        isValid: true,
        accessibleBuckets: ['prod', 'uat'],
        inaccessibleBuckets: []
      });
    });

    it('should detect inaccessible buckets', async () => {
      mockExecSync
        .mockReturnValueOnce('') // prod bucket accessible
        .mockImplementationOnce(() => { throw new Error('Access denied'); }); // uat bucket not accessible
      
      const result = await S3Sync.validateS3Buckets(['prod', 'uat']);
      
      expect(result).toEqual({
        isValid: false,
        accessibleBuckets: ['prod'],
        inaccessibleBuckets: ['uat']
      });
    });
  });
});