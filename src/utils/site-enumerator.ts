import { execSync } from 'child_process';
import chalk from 'chalk';
import { Config } from './config';

export interface SiteInfo {
  blogId: number;
  domain: string;
  path: string;
  registeredDate: string;
  lastUpdated: string;
  isPublic: boolean;
  isArchived: boolean;
  isMature: boolean;
  isSpam: boolean;
  isDeleted: boolean;
  lang?: string;
}

export interface SiteFilterOptions {
  includeSites?: number[];
  excludeSites?: number[];
  activeOnly?: boolean;
  includeMainSite?: boolean;
}

export interface SiteEnumerationResult {
  sites: SiteInfo[];
  totalCount: number;
  filteredCount: number;
  environment: string;
}

export class SiteEnumerator {
  static async enumerateSites(
    environment: string,
    filters: SiteFilterOptions = {}
  ): Promise<SiteEnumerationResult> {
    const envConfig = Config.getEnvironmentConfig(environment);

    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      throw new Error(
        `Environment '${environment}' is not configured. Run 'wfuwp config wizard' to set up.`
      );
    }

    const sites = await this.queryWpBlogsTable(envConfig);
    const filteredSites = this.applySiteFilters(sites, filters);

    return {
      sites: filteredSites,
      totalCount: sites.length,
      filteredCount: filteredSites.length,
      environment,
    };
  }

  private static async queryWpBlogsTable(envConfig: any): Promise<SiteInfo[]> {
    try {
      const query = `
        SELECT 
          blog_id,
          domain,
          path,
          registered,
          last_updated,
          public,
          archived,
          mature,
          spam,
          deleted,
          lang_id
        FROM wp_blogs 
        ORDER BY blog_id ASC
      `;

      const output = execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${query}" --batch --skip-column-names`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const sites: SiteInfo[] = [];
      const lines = output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      for (const line of lines) {
        const columns = line.split('\t');
        if (columns.length >= 10) {
          sites.push({
            blogId: parseInt(columns[0], 10),
            domain: columns[1],
            path: columns[2],
            registeredDate: columns[3],
            lastUpdated: columns[4],
            isPublic: columns[5] === '1',
            isArchived: columns[6] === '1',
            isMature: columns[7] === '1',
            isSpam: columns[8] === '1',
            isDeleted: columns[9] === '1',
            lang: columns[10] && columns[10] !== '0' ? columns[10] : undefined,
          });
        }
      }

      return sites;
    } catch (error) {
      throw new Error(
        `Failed to enumerate sites: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private static applySiteFilters(
    sites: SiteInfo[],
    filters: SiteFilterOptions
  ): SiteInfo[] {
    let filteredSites = [...sites];

    if (filters.activeOnly) {
      filteredSites = filteredSites.filter(
        (site) => !site.isArchived && !site.isSpam && !site.isDeleted
      );
    }

    if (!filters.includeMainSite) {
      filteredSites = filteredSites.filter((site) => site.blogId !== 1);
    }

    if (filters.includeSites && filters.includeSites.length > 0) {
      filteredSites = filteredSites.filter((site) =>
        filters.includeSites!.includes(site.blogId)
      );
    }

    if (filters.excludeSites && filters.excludeSites.length > 0) {
      filteredSites = filteredSites.filter(
        (site) => !filters.excludeSites!.includes(site.blogId)
      );
    }

    return filteredSites;
  }

  static async validateSiteExists(
    siteId: number,
    environment: string
  ): Promise<boolean> {
    try {
      const result = await this.enumerateSites(environment);
      return result.sites.some((site) => site.blogId === siteId);
    } catch (error) {
      return false;
    }
  }

  static async getSiteInfo(
    siteId: number,
    environment: string
  ): Promise<SiteInfo | null> {
    try {
      const result = await this.enumerateSites(environment);
      return result.sites.find((site) => site.blogId === siteId) || null;
    } catch (error) {
      return null;
    }
  }

  static async generateSiteConfirmation(
    sites: SiteInfo[],
    environment: string
  ): Promise<string> {
    const activeSites = sites.filter(
      (site) => !site.isArchived && !site.isSpam && !site.isDeleted
    );

    const inactiveSites = sites.filter(
      (site) => site.isArchived || site.isSpam || site.isDeleted
    );

    let confirmation = `\n${chalk.cyan('Site Discovery Results:')} ${chalk.bold(environment)}\n`;
    confirmation += `${chalk.green('●')} Total sites found: ${sites.length}\n`;
    confirmation += `${chalk.green('●')} Active sites: ${activeSites.length}\n`;

    if (inactiveSites.length > 0) {
      confirmation += `${chalk.yellow('●')} Inactive sites: ${inactiveSites.length}\n`;
    }

    if (activeSites.length <= 10) {
      confirmation += `\n${chalk.cyan('Active Sites:')}\n`;
      activeSites.forEach((site) => {
        confirmation += `  ${chalk.dim('ID')} ${site.blogId.toString().padStart(3)} - ${site.domain}${site.path}\n`;
      });
    } else {
      confirmation += `\n${chalk.cyan('Sample of Active Sites:')}\n`;
      activeSites.slice(0, 5).forEach((site) => {
        confirmation += `  ${chalk.dim('ID')} ${site.blogId.toString().padStart(3)} - ${site.domain}${site.path}\n`;
      });
      confirmation += `  ${chalk.dim('... and')} ${activeSites.length - 5} ${chalk.dim('more sites')}\n`;
    }

    return confirmation;
  }
}
