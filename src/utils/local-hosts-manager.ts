import { readFileSync, writeFileSync } from 'fs';

const HOSTS_FILE = '/etc/hosts';
const MARKER_START = '# WFU WordPress CLI - Local Development Start';
const MARKER_END = '# WFU WordPress CLI - Local Development End';

export interface LocalDomain {
  domain: string;
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

  private validateDomain(domain: string): boolean {
    // Accept wfu.local and any subdomain of wfu.local
    return domain === 'wfu.local' || domain.endsWith('.wfu.local');
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
            // Accept any .wfu.local domain
            if (domain.endsWith('.wfu.local') || domain === 'wfu.local') {
              domains.push({
                domain: domain,
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

  addDomain(domain: string): LocalDomain {
    this.requiresAdminRights();
    
    if (!this.validateDomain(domain)) {
      throw new Error(
        `Invalid domain: ${domain}. Must be wfu.local or *.wfu.local`
      );
    }
    
    const ipAddress = this.getLocalIpAddress();
    const localDomain: LocalDomain = {
      domain,
      ipAddress,
    };
    
    const currentDomains = this.getCurrentDomains();
    const existingDomain = currentDomains.find((d) => d.domain === domain);
    if (existingDomain) {
      throw new Error(
        `Domain ${domain} already exists in hosts file`
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

  removeDomain(domain: string): boolean {
    this.requiresAdminRights();
    const currentDomains = this.getCurrentDomains();
    const domainExists = currentDomains.some((d) => d.domain === domain);
    if (!domainExists) {
      return false;
    }
    const updatedDomains = currentDomains.filter((d) => d.domain !== domain);
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

  domainExists(domain: string): boolean {
    const currentDomains = this.getCurrentDomains();
    return currentDomains.some((d) => d.domain === domain);
  }

  getDomain(domain: string): LocalDomain | null {
    const currentDomains = this.getCurrentDomains();
    return currentDomains.find((d) => d.domain === domain) || null;
  }
}
