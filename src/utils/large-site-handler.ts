import chalk from 'chalk';

interface LargeSiteConfig {
  largeSites: Set<number>;
  timeoutMultiplier: number;
  retryMultiplier: number;
  separateProcessing: boolean;
  deferToEnd: boolean;
}

interface SiteSizeInfo {
  siteId: number;
  estimatedSize: 'small' | 'medium' | 'large' | 'xlarge';
  tableCount?: number;
  dataSize?: number; // in MB
  recommendedTimeout?: number; // in minutes
}

export class LargeSiteHandler {
  private readonly config: LargeSiteConfig;
  private sizeCache: Map<number, SiteSizeInfo> = new Map();

  constructor(
    largeSiteIds: number[] = [],
    options: Partial<LargeSiteConfig> = {}
  ) {
    this.config = {
      largeSites: new Set(largeSiteIds),
      timeoutMultiplier: 3,
      retryMultiplier: 2,
      separateProcessing: true,
      deferToEnd: true,
      ...options,
    };
  }

  isLargeSite(siteId: number): boolean {
    return this.config.largeSites.has(siteId);
  }

  addLargeSite(siteId: number): void {
    this.config.largeSites.add(siteId);
  }

  removeLargeSite(siteId: number): void {
    this.config.largeSites.delete(siteId);
  }

  getLargeSites(): number[] {
    return Array.from(this.config.largeSites);
  }

  getTimeoutForSite(siteId: number, defaultTimeout: number): number {
    if (this.isLargeSite(siteId)) {
      const sizeInfo = this.sizeCache.get(siteId);

      if (sizeInfo?.recommendedTimeout) {
        return sizeInfo.recommendedTimeout;
      }

      // Use multiplier based on site size category
      if (sizeInfo?.estimatedSize === 'xlarge') {
        return defaultTimeout * 5;
      } else if (sizeInfo?.estimatedSize === 'large') {
        return defaultTimeout * this.config.timeoutMultiplier;
      }

      // Default large site timeout
      return defaultTimeout * this.config.timeoutMultiplier;
    }

    return defaultTimeout;
  }

  getRetriesForSite(siteId: number, defaultRetries: number): number {
    if (this.isLargeSite(siteId)) {
      return Math.ceil(defaultRetries * this.config.retryMultiplier);
    }
    return defaultRetries;
  }

  separateSitesBySize(sites: number[]): {
    regular: number[];
    large: number[];
    xlarge: number[];
  } {
    const regular: number[] = [];
    const large: number[] = [];
    const xlarge: number[] = [];

    for (const siteId of sites) {
      const sizeInfo = this.sizeCache.get(siteId);

      if (this.isLargeSite(siteId)) {
        if (sizeInfo?.estimatedSize === 'xlarge') {
          xlarge.push(siteId);
        } else {
          large.push(siteId);
        }
      } else {
        regular.push(siteId);
      }
    }

    return { regular, large, xlarge };
  }

  getProcessingOrder(sites: number[]): {
    batches: Array<{
      sites: number[];
      type: 'regular' | 'large' | 'xlarge';
      recommendedBatchSize: number;
      recommendedTimeout: number;
    }>;
    summary: string;
  } {
    const separated = this.separateSitesBySize(sites);
    const batches = [];

    // Regular sites first (normal batch processing)
    if (separated.regular.length > 0) {
      batches.push({
        sites: separated.regular,
        type: 'regular' as const,
        recommendedBatchSize: 5,
        recommendedTimeout: 20,
      });
    }

    // Large sites in smaller batches
    if (separated.large.length > 0) {
      batches.push({
        sites: separated.large,
        type: 'large' as const,
        recommendedBatchSize: 2,
        recommendedTimeout: 60,
      });
    }

    // XL sites processed individually
    if (separated.xlarge.length > 0) {
      batches.push({
        sites: separated.xlarge,
        type: 'xlarge' as const,
        recommendedBatchSize: 1,
        recommendedTimeout: 120,
      });
    }

    const summary = this.generateProcessingSummary(separated);

    return { batches, summary };
  }

  private generateProcessingSummary(separated: {
    regular: number[];
    large: number[];
    xlarge: number[];
  }): string {
    const parts = [];

    if (separated.regular.length > 0) {
      parts.push(`${separated.regular.length} regular sites`);
    }

    if (separated.large.length > 0) {
      parts.push(`${separated.large.length} large sites`);
    }

    if (separated.xlarge.length > 0) {
      parts.push(`${separated.xlarge.length} extra-large sites`);
    }

    return parts.join(', ');
  }

  estimateSiteSize(
    siteId: number,
    tableCount?: number,
    dataSize?: number
  ): SiteSizeInfo {
    let estimatedSize: SiteSizeInfo['estimatedSize'] = 'medium';
    let recommendedTimeout = 20; // default timeout in minutes

    // Use provided data if available
    if (tableCount && dataSize) {
      if (dataSize > 5000 || tableCount > 500) {
        // 5GB or 500+ tables
        estimatedSize = 'xlarge';
        recommendedTimeout = 120;
      } else if (dataSize > 1000 || tableCount > 200) {
        // 1GB or 200+ tables
        estimatedSize = 'large';
        recommendedTimeout = 60;
      } else if (dataSize > 100 || tableCount > 50) {
        // 100MB or 50+ tables
        estimatedSize = 'medium';
        recommendedTimeout = 30;
      } else {
        estimatedSize = 'small';
        recommendedTimeout = 15;
      }
    } else {
      // Fallback: check if manually marked as large
      if (this.isLargeSite(siteId)) {
        estimatedSize = 'large';
        recommendedTimeout = 60;
      }
    }

    const sizeInfo: SiteSizeInfo = {
      siteId,
      estimatedSize,
      tableCount,
      dataSize,
      recommendedTimeout,
    };

    this.sizeCache.set(siteId, sizeInfo);
    return sizeInfo;
  }

  displaySiteInfo(siteId: number): void {
    const sizeInfo =
      this.sizeCache.get(siteId) || this.estimateSiteSize(siteId);
    const isLarge = this.isLargeSite(siteId);

    let sizeDisplay = sizeInfo.estimatedSize.toUpperCase();
    let color = chalk.white;

    switch (sizeInfo.estimatedSize) {
      case 'small':
        color = chalk.green;
        break;
      case 'medium':
        color = chalk.blue;
        break;
      case 'large':
        color = chalk.yellow;
        break;
      case 'xlarge':
        color = chalk.red;
        break;
    }

    if (isLarge) {
      sizeDisplay += ' (marked as large)';
    }

    console.log(color(`    Site ${siteId}: ${sizeDisplay}`));

    if (sizeInfo.tableCount) {
      console.log(chalk.gray(`      Tables: ${sizeInfo.tableCount}`));
    }

    if (sizeInfo.dataSize) {
      console.log(
        chalk.gray(`      Data size: ${sizeInfo.dataSize.toFixed(1)} MB`)
      );
    }

    if (sizeInfo.recommendedTimeout) {
      console.log(
        chalk.gray(
          `      Recommended timeout: ${sizeInfo.recommendedTimeout} minutes`
        )
      );
    }
  }

  getSpecialInstructions(siteId: number): string[] {
    const instructions = [];
    const sizeInfo = this.sizeCache.get(siteId);

    if (this.isLargeSite(siteId)) {
      instructions.push('🔶 Large site - extended timeout and retries');
    }

    if (sizeInfo?.estimatedSize === 'xlarge') {
      instructions.push('🔴 Extra-large site - process individually');
      instructions.push('💡 Consider processing during off-peak hours');
      instructions.push('⚠️  Monitor memory usage and database connections');
    }

    if (sizeInfo?.dataSize && sizeInfo.dataSize > 2000) {
      instructions.push('💾 Very large dataset - ensure adequate disk space');
    }

    return instructions;
  }

  shouldSkipInBatch(
    siteId: number,
    batchType: 'regular' | 'large' | 'xlarge'
  ): boolean {
    const sizeInfo = this.sizeCache.get(siteId);

    // XL sites should only be processed in XL batches
    if (sizeInfo?.estimatedSize === 'xlarge' && batchType !== 'xlarge') {
      return true;
    }

    // Large sites should be deferred if configured to do so
    if (
      this.isLargeSite(siteId) &&
      this.config.deferToEnd &&
      batchType === 'regular'
    ) {
      return true;
    }

    return false;
  }

  getEstimatedDuration(
    sites: number[],
    baseTimePerSite: number = 2
  ): {
    totalMinutes: number;
    breakdown: Array<{
      type: string;
      count: number;
      timePerSite: number;
      totalTime: number;
    }>;
  } {
    const separated = this.separateSitesBySize(sites);
    const breakdown = [];
    let totalMinutes = 0;

    if (separated.regular.length > 0) {
      const timePerSite = baseTimePerSite;
      const totalTime = separated.regular.length * timePerSite;
      breakdown.push({
        type: 'Regular sites',
        count: separated.regular.length,
        timePerSite,
        totalTime,
      });
      totalMinutes += totalTime;
    }

    if (separated.large.length > 0) {
      const timePerSite = baseTimePerSite * 3;
      const totalTime = separated.large.length * timePerSite;
      breakdown.push({
        type: 'Large sites',
        count: separated.large.length,
        timePerSite,
        totalTime,
      });
      totalMinutes += totalTime;
    }

    if (separated.xlarge.length > 0) {
      const timePerSite = baseTimePerSite * 8;
      const totalTime = separated.xlarge.length * timePerSite;
      breakdown.push({
        type: 'Extra-large sites',
        count: separated.xlarge.length,
        timePerSite,
        totalTime,
      });
      totalMinutes += totalTime;
    }

    return { totalMinutes, breakdown };
  }
}
