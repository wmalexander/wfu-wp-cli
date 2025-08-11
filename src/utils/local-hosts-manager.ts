import { readFileSync, writeFileSync } from 'fs';

const HOSTS_FILE = '/etc/hosts';
const MARKER_START = '# WFU WordPress CLI - Local Development Start';
const MARKER_END = '# WFU WordPress CLI - Local Development End';

export interface LocalDomain {
  siteId: string;
  domain: string;
  port: string;
  ipAddress: string;
}

export class LocalHostsManager {
  private readHostsFile(): string {
    try {
      return readFileSync(HOSTS_FILE, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read hosts file: ${error}`);
    }
  }

  private writeHostsFile(content: string): void {
    try {
      writeFileSync(HOSTS_FILE, content, 'utf8');
    } catch (error) {
      throw new Error(`Failed to write hosts file: ${error}`);
    }
  }

  private requiresAdminRights(): void {
    if (process.getuid && process.getuid() !== 0) {
      throw new Error(
        'Administrator privileges required to modify /etc/hosts file'
      );
    }
  }

  private generateLocalDomain(siteId: string): string {
    return `site${siteId}.local.wfu.edu`;
  }

  private getLocalIpAddress(): string {
    return '127.0.0.1';
  }

  private createHostEntry(domain: LocalDomain): string {
    return `${domain.ipAddress}\t${domain.domain}`;
  }

  private removeExistingLocalSection(hostsContent: string): string {
    const lines = hostsContent.split('\n');
    const result: string[] = [];
    let inLocalSection = false;
    for (const line of lines) {
      if (line.trim() === MARKER_START) {
        inLocalSection = true;
        continue;
      }
      if (line.trim() === MARKER_END) {
        inLocalSection = false;
        continue;
      }
      if (!inLocalSection) {
        result.push(line);
      }
    }
    return result.join('\n');
  }

  getCurrentDomains(): LocalDomain[] {
    const domains: LocalDomain[] = [];
    try {
      const hostsContent = this.readHostsFile();
      const lines = hostsContent.split('\n');
      let inLocalSection = false;
      for (const line of lines) {
        if (line.trim() === MARKER_START) {
          inLocalSection = true;
          continue;
        }
        if (line.trim() === MARKER_END) {
          inLocalSection = false;
          continue;
        }
        if (inLocalSection && line.trim() && !line.startsWith('#')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const ipAddress = parts[0];
            const domain = parts[1];
            const siteIdMatch = domain.match(/^site(\d+)\.local\.wfu\.edu$/);
            if (siteIdMatch) {
              domains.push({
                siteId: siteIdMatch[1],
                domain: domain,
                port: '8443',
                ipAddress: ipAddress,
              });
            }
          }
        }
      }
    } catch (error) {
      return [];
    }
    return domains;
  }

  addDomain(siteId: string, port: string = '8443'): LocalDomain {
    this.requiresAdminRights();
    const domain = this.generateLocalDomain(siteId);
    const ipAddress = this.getLocalIpAddress();
    const localDomain: LocalDomain = {
      siteId,
      domain,
      port,
      ipAddress,
    };
    const currentDomains = this.getCurrentDomains();
    const existingDomain = currentDomains.find((d) => d.siteId === siteId);
    if (existingDomain) {
      throw new Error(
        `Local domain for site ${siteId} already exists: ${existingDomain.domain}`
      );
    }
    const hostsContent = this.readHostsFile();
    const cleanedContent = this.removeExistingLocalSection(hostsContent);
    const updatedDomains = [...currentDomains, localDomain];
    const newLocalSection = this.buildLocalSection(updatedDomains);
    const newContent = cleanedContent.endsWith('\n')
      ? cleanedContent
      : cleanedContent + '\n';
    const finalContent = newContent + newLocalSection;
    this.writeHostsFile(finalContent);
    return localDomain;
  }

  removeDomain(siteId: string): boolean {
    this.requiresAdminRights();
    const currentDomains = this.getCurrentDomains();
    const domainExists = currentDomains.some((d) => d.siteId === siteId);
    if (!domainExists) {
      return false;
    }
    const updatedDomains = currentDomains.filter((d) => d.siteId !== siteId);
    const hostsContent = this.readHostsFile();
    const cleanedContent = this.removeExistingLocalSection(hostsContent);
    if (updatedDomains.length === 0) {
      this.writeHostsFile(cleanedContent);
    } else {
      const newLocalSection = this.buildLocalSection(updatedDomains);
      const newContent = cleanedContent.endsWith('\n')
        ? cleanedContent
        : cleanedContent + '\n';
      const finalContent = newContent + newLocalSection;
      this.writeHostsFile(finalContent);
    }
    return true;
  }

  removeAllDomains(): number {
    this.requiresAdminRights();
    const currentDomains = this.getCurrentDomains();
    const count = currentDomains.length;
    if (count === 0) {
      return 0;
    }
    const hostsContent = this.readHostsFile();
    const cleanedContent = this.removeExistingLocalSection(hostsContent);
    this.writeHostsFile(cleanedContent);
    return count;
  }

  private buildLocalSection(domains: LocalDomain[]): string {
    if (domains.length === 0) {
      return '';
    }
    const lines = [MARKER_START];
    for (const domain of domains) {
      lines.push(this.createHostEntry(domain));
    }
    lines.push(MARKER_END);
    return lines.join('\n') + '\n';
  }

  domainExists(siteId: string): boolean {
    const currentDomains = this.getCurrentDomains();
    return currentDomains.some((d) => d.siteId === siteId);
  }

  getDomain(siteId: string): LocalDomain | null {
    const currentDomains = this.getCurrentDomains();
    return currentDomains.find((d) => d.siteId === siteId) || null;
  }
}
