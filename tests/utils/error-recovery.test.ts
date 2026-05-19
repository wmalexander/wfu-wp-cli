import { ErrorRecovery } from '../../src/utils/error-recovery';

describe('ErrorRecovery', () => {
  describe('isRetryableError', () => {
    it.each([
      'Connection timeout while talking to RDS',
      'ER_LOCK_DEADLOCK: Deadlock found',
      'network error: ECONNRESET',
      'Too many connections',
    ])('treats %s as retryable', (msg) => {
      expect(ErrorRecovery.isRetryableError(msg)).toBe(true);
    });

    it('treats an unrelated error as non-retryable', () => {
      expect(ErrorRecovery.isRetryableError('Syntax error near SELECT')).toBe(
        false
      );
    });

    it('matches case-insensitively', () => {
      expect(ErrorRecovery.isRetryableError('CONNECTION REFUSED')).toBe(true);
    });
  });

  describe('retryWithBackoff', () => {
    it('returns the operation result without retrying on success', async () => {
      const op = jest.fn().mockResolvedValue('ok');
      const result = await ErrorRecovery.retryWithBackoff(op, 'ctx', {
        retryDelay: 0,
      });
      expect(result).toBe('ok');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries a retryable failure then succeeds', async () => {
      const op = jest
        .fn()
        .mockRejectedValueOnce(new Error('connection timeout'))
        .mockResolvedValue('recovered');
      const result = await ErrorRecovery.retryWithBackoff(op, 'ctx', {
        retryDelay: 0,
        maxRetries: 3,
      });
      expect(result).toBe('recovered');
      expect(op).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-retryable error', async () => {
      const op = jest.fn().mockRejectedValue(new Error('fatal syntax error'));
      await expect(
        ErrorRecovery.retryWithBackoff(op, 'ctx', { retryDelay: 0 })
      ).rejects.toThrow('fatal syntax error');
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('gives up after maxRetries on a persistently retryable error', async () => {
      const op = jest.fn().mockRejectedValue(new Error('deadlock'));
      await expect(
        ErrorRecovery.retryWithBackoff(op, 'ctx', {
          retryDelay: 0,
          maxRetries: 3,
        })
      ).rejects.toThrow('deadlock');
      expect(op).toHaveBeenCalledTimes(3);
    });
  });

  describe('createMigrationContext / updateMigrationContext', () => {
    it('creates an initialized context', () => {
      const ctx = ErrorRecovery.createMigrationContext('prod', 'uat', {
        dryRun: true,
      });
      expect(ctx).toMatchObject({
        sourceEnv: 'prod',
        targetEnv: 'uat',
        sitesInProgress: [],
        completedSites: [],
        failedSites: [],
        networkTablesProcessed: false,
        currentStep: 'initialization',
        options: { dryRun: true },
      });
      expect(ctx.startTime).toBeInstanceOf(Date);
    });

    it('merges updates without mutating the original', () => {
      const ctx = ErrorRecovery.createMigrationContext('prod', 'uat', {});
      const updated = ErrorRecovery.updateMigrationContext(ctx, {
        currentStep: 'migrating',
        completedSites: [1, 2],
      });
      expect(updated.currentStep).toBe('migrating');
      expect(updated.completedSites).toEqual([1, 2]);
      expect(ctx.currentStep).toBe('initialization');
    });
  });
});
