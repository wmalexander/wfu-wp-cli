import { execSync } from 'child_process';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ErrorRecovery', () => {
  let ErrorRecovery: any;
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

  describe('retryWithBackoff', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await ErrorRecovery.retryWithBackoff(mockOperation, {
        maxRetries: 3,
        initialDelay: 100,
        backoffMultiplier: 2
      });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Failed attempt 1'))
        .mockRejectedValueOnce(new Error('Failed attempt 2'))
        .mockResolvedValue('success');
      
      const result = await ErrorRecovery.retryWithBackoff(mockOperation, {
        maxRetries: 3,
        initialDelay: 10,
        backoffMultiplier: 2
      });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      await expect(
        ErrorRecovery.retryWithBackoff(mockOperation, {
          maxRetries: 2,
          initialDelay: 10,
          backoffMultiplier: 2
        })
      ).rejects.toThrow('Persistent failure');
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should apply exponential backoff', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await ErrorRecovery.retryWithBackoff(mockOperation, {
        maxRetries: 2,
        initialDelay: 50,
        backoffMultiplier: 2
      });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should have waited at least 50ms + 100ms = 150ms
      expect(totalTime).toBeGreaterThan(100);
    });
  });

  describe('isTransientError', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should identify connection errors as transient', () => {
      const connectionErrors = [
        new Error('Connection timeout'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
        new Error('ETIMEDOUT'),
        new Error('Connection lost')
      ];
      
      connectionErrors.forEach(error => {
        expect(ErrorRecovery.isTransientError(error)).toBe(true);
      });
    });

    it('should identify temporary server errors as transient', () => {
      const serverErrors = [
        new Error('Server temporarily unavailable'),
        new Error('Lock wait timeout'),
        new Error('Too many connections'),
        new Error('Deadlock found')
      ];
      
      serverErrors.forEach(error => {
        expect(ErrorRecovery.isTransientError(error)).toBe(true);
      });
    });

    it('should identify permanent errors as non-transient', () => {
      const permanentErrors = [
        new Error('Access denied'),
        new Error('Unknown database'),
        new Error('Syntax error'),
        new Error('Table does not exist'),
        new Error('Authentication failed')
      ];
      
      permanentErrors.forEach(error => {
        expect(ErrorRecovery.isTransientError(error)).toBe(false);
      });
    });
  });

  describe('createErrorReport', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should create comprehensive error report', () => {
      const error = new Error('Test error');
      const context = {
        operation: 'migrate-site',
        siteId: 123,
        environment: 'prod',
        timestamp: '2023-12-01T10:00:00Z'
      };
      
      const report = ErrorRecovery.createErrorReport(error, context);
      
      expect(report).toEqual({
        errorMessage: 'Test error',
        errorType: 'Error',
        context: context,
        timestamp: expect.any(String),
        isTransient: expect.any(Boolean),
        suggestedActions: expect.arrayContaining([expect.any(String)]),
        stackTrace: expect.any(String)
      });
    });

    it('should suggest appropriate actions for different error types', () => {
      const connectionError = new Error('Connection timeout');
      const syntaxError = new Error('Syntax error');
      
      const connectionReport = ErrorRecovery.createErrorReport(connectionError, {});
      const syntaxReport = ErrorRecovery.createErrorReport(syntaxError, {});
      
      expect(connectionReport.suggestedActions).toContain('Check network connectivity');
      expect(syntaxReport.suggestedActions).toContain('Review command syntax');
    });
  });

  describe('attemptRecovery', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should attempt automatic recovery for transient errors', async () => {
      const transientError = new Error('Connection timeout');
      const mockRecoveryAction = jest.fn().mockResolvedValue(true);
      
      const result = await ErrorRecovery.attemptRecovery(transientError, {
        operation: 'database-connection',
        recoveryActions: [mockRecoveryAction]
      });
      
      expect(result.recovered).toBe(true);
      expect(mockRecoveryAction).toHaveBeenCalled();
    });

    it('should not attempt recovery for permanent errors', async () => {
      const permanentError = new Error('Access denied');
      const mockRecoveryAction = jest.fn();
      
      const result = await ErrorRecovery.attemptRecovery(permanentError, {
        operation: 'database-connection',
        recoveryActions: [mockRecoveryAction]
      });
      
      expect(result.recovered).toBe(false);
      expect(mockRecoveryAction).not.toHaveBeenCalled();
    });

    it('should track recovery attempts', async () => {
      const transientError = new Error('Connection timeout');
      const mockRecoveryAction = jest.fn()
        .mockRejectedValueOnce(new Error('Recovery failed'))
        .mockResolvedValue(true);
      
      const result = await ErrorRecovery.attemptRecovery(transientError, {
        operation: 'database-connection',
        recoveryActions: [mockRecoveryAction, mockRecoveryAction]
      });
      
      expect(result.recovered).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('logError', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should log error with appropriate severity', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const error = new Error('Test error');
      const context = { operation: 'test-operation' };
      
      ErrorRecovery.logError(error, context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
      
      consoleSpy.mockRestore();
    });

    it('should include context information in log', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const error = new Error('Test error');
      const context = { 
        operation: 'migrate-site',
        siteId: 123,
        environment: 'prod'
      };
      
      ErrorRecovery.logError(error, context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('migrate-site')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getRecoveryStrategy', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/error-recovery');
      ErrorRecovery = module.ErrorRecovery;
    });

    it('should provide retry strategy for connection errors', () => {
      const connectionError = new Error('Connection timeout');
      
      const strategy = ErrorRecovery.getRecoveryStrategy(connectionError, 'database-operation');
      
      expect(strategy.strategy).toBe('retry');
      expect(strategy.maxRetries).toBeGreaterThan(0);
      expect(strategy.backoffMultiplier).toBeGreaterThan(1);
    });

    it('should provide rollback strategy for data corruption errors', () => {
      const corruptionError = new Error('Data integrity check failed');
      
      const strategy = ErrorRecovery.getRecoveryStrategy(corruptionError, 'data-import');
      
      expect(strategy.strategy).toBe('rollback');
      expect(strategy.actions).toContain('restore-from-backup');
    });

    it('should provide manual strategy for critical errors', () => {
      const criticalError = new Error('Access denied');
      
      const strategy = ErrorRecovery.getRecoveryStrategy(criticalError, 'authentication');
      
      expect(strategy.strategy).toBe('manual');
      expect(strategy.userAction).toBeTruthy();
    });
  });
});