import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

export interface DDEVStatus {
  isInstalled: boolean;
  version?: string;
  isRunning: boolean;
  projects: DDEVProject[];
  dockerStatus: DockerStatus;
}

export interface DDEVProject {
  name: string;
  status: 'running' | 'stopped' | 'paused';
  url?: string;
  siteId?: string;
  type?: string;
  location?: string;
}

export interface DockerStatus {
  isInstalled: boolean;
  version?: string;
  isRunning: boolean;
  compose: boolean;
}

export interface SystemDependency {
  name: string;
  installed: boolean;
  version?: string;
  required: boolean;
  installCommand?: string;
}

export interface EnvironmentHealth {
  overall: 'healthy' | 'warning' | 'error';
  docker: DockerStatus;
  ddev: DDEVStatus;
  dependencies: SystemDependency[];
  recommendations: string[];
}

export class DDEVManager {
  private runCommand(
    command: string,
    options: { silent?: boolean } = {}
  ): string {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
      });
      return result?.trim() || '';
    } catch (error) {
      if (!options.silent) {
        throw error;
      }
      return '';
    }
  }

  private isCommandAvailable(command: string): boolean {
    try {
      const which = os.platform() === 'win32' ? 'where' : 'which';
      this.runCommand(`${which} ${command}`, { silent: true });
      return true;
    } catch {
      return false;
    }
  }

  private getVersion(
    command: string,
    versionFlag: string = '--version'
  ): string | undefined {
    try {
      const output = this.runCommand(`${command} ${versionFlag}`, {
        silent: true,
      });
      const versionMatch = output.match(/\d+\.\d+\.\d+/);
      return versionMatch ? versionMatch[0] : undefined;
    } catch {
      return undefined;
    }
  }

  checkDockerStatus(): DockerStatus {
    const dockerInstalled = this.isCommandAvailable('docker');
    let dockerRunning = false;
    let dockerVersion: string | undefined;
    let dockerCompose = false;

    if (dockerInstalled) {
      dockerVersion = this.getVersion('docker');
      try {
        this.runCommand('docker ps', { silent: true });
        dockerRunning = true;
      } catch {
        dockerRunning = false;
      }
      dockerCompose =
        this.isCommandAvailable('docker-compose') ||
        (this.isCommandAvailable('docker') &&
          this.runCommand('docker compose version', { silent: true }) !== '');
    }

    return {
      isInstalled: dockerInstalled,
      version: dockerVersion,
      isRunning: dockerRunning,
      compose: dockerCompose,
    };
  }

  checkDDEVInstallation(): boolean {
    return this.isCommandAvailable('ddev');
  }

  getDDEVVersion(): string | null {
    if (!this.checkDDEVInstallation()) {
      return null;
    }
    return this.getVersion('ddev') || null;
  }

  getProjects(): DDEVProject[] {
    if (!this.checkDDEVInstallation()) {
      return [];
    }

    try {
      const output = this.runCommand('ddev list --json-output', {
        silent: true,
      });
      const projectsData = JSON.parse(output);

      // Handle the new DDEV JSON output format with 'raw' field
      const projects = projectsData.raw || projectsData;

      if (Array.isArray(projects)) {
        return projects.map((project) => ({
          name: project.name || 'unknown',
          status: project.status === 'running' ? 'running' : 'stopped',
          url: project.httpsurl || project.httpurl,
          type: project.type || 'unknown',
          location: project.approot || 'unknown',
          siteId: this.extractSiteIdFromProject(project.name),
        }));
      }

      return [];
    } catch {
      return [];
    }
  }

  private extractSiteIdFromProject(projectName: string): string | undefined {
    const match = projectName.match(/site-?(\d+)/i);
    return match ? match[1] : undefined;
  }

  getStatus(): DDEVStatus {
    const dockerStatus = this.checkDockerStatus();
    const isInstalled = this.checkDDEVInstallation();
    const version = this.getDDEVVersion();
    const projects = this.getProjects();
    const isRunning = projects.some((p) => p.status === 'running');

    return {
      isInstalled,
      version: version || undefined,
      isRunning,
      projects,
      dockerStatus,
    };
  }

  checkSystemDependencies(): SystemDependency[] {
    const dependencies: SystemDependency[] = [];

    const tools = [
      {
        name: 'Git',
        command: 'git',
        required: true,
        installCommand:
          os.platform() === 'darwin'
            ? 'brew install git'
            : 'apt-get install git',
      },
      {
        name: 'Curl',
        command: 'curl',
        required: true,
        installCommand:
          os.platform() === 'darwin'
            ? 'brew install curl'
            : 'apt-get install curl',
      },
      {
        name: 'mkcert',
        command: 'mkcert',
        required: false,
        installCommand:
          os.platform() === 'darwin'
            ? 'brew install mkcert'
            : 'See: https://github.com/FiloSottile/mkcert#installation',
      },
    ];

    for (const tool of tools) {
      const installed = this.isCommandAvailable(tool.command);
      const version = installed ? this.getVersion(tool.command) : undefined;

      dependencies.push({
        name: tool.name,
        installed,
        version,
        required: tool.required,
        installCommand: tool.installCommand,
      });
    }

    return dependencies;
  }

  checkEnvironmentHealth(): EnvironmentHealth {
    const docker = this.checkDockerStatus();
    const ddev = this.getStatus();
    const dependencies = this.checkSystemDependencies();
    const recommendations: string[] = [];

    let overall: 'healthy' | 'warning' | 'error' = 'healthy';

    if (!docker.isInstalled) {
      overall = 'error';
      recommendations.push(
        'Install Docker Desktop from https://docker.com/get-started'
      );
    } else if (!docker.isRunning) {
      overall = 'warning';
      recommendations.push('Start Docker Desktop to enable local development');
    }

    if (!docker.compose) {
      overall = 'warning';
      recommendations.push('Enable Docker Compose support in Docker Desktop');
    }

    if (!ddev.isInstalled) {
      overall = 'warning';
      recommendations.push(
        'Install DDEV from https://ddev.readthedocs.io/en/latest/users/install/'
      );
    }

    const missingRequired = dependencies.filter(
      (d) => d.required && !d.installed
    );
    if (missingRequired.length > 0) {
      overall = 'error';
      for (const dep of missingRequired) {
        recommendations.push(`Install ${dep.name}: ${dep.installCommand}`);
      }
    }

    const missingOptional = dependencies.filter(
      (d) => !d.required && !d.installed
    );
    for (const dep of missingOptional) {
      recommendations.push(
        `Consider installing ${dep.name}: ${dep.installCommand}`
      );
    }

    if (ddev.isInstalled && docker.isRunning && ddev.projects.length === 0) {
      recommendations.push(
        'No DDEV projects found. Use "ddev config" to set up a project'
      );
    }

    return {
      overall,
      docker,
      ddev,
      dependencies,
      recommendations,
    };
  }

  findWordPressProjects(searchPath: string = process.cwd()): string[] {
    const projects: string[] = [];
    const possiblePaths = [
      searchPath,
      path.join(os.homedir(), 'Sites'),
      path.join(os.homedir(), 'Development'),
      path.join(os.homedir(), 'Code'),
      '/var/www',
      '/usr/local/var/www',
    ];

    for (const basePath of possiblePaths) {
      if (existsSync(basePath)) {
        try {
          const ddevConfig = path.join(basePath, '.ddev', 'config.yaml');
          const wpConfig = path.join(basePath, 'wp-config.php');

          if (existsSync(ddevConfig) && existsSync(wpConfig)) {
            projects.push(basePath);
          }
        } catch {
          continue;
        }
      }
    }

    return projects;
  }

  startProject(projectName?: string): { success: boolean; message: string } {
    if (!this.checkDDEVInstallation()) {
      return {
        success: false,
        message:
          'DDEV is not installed. Run "wfuwp local install dependencies" first.',
      };
    }
    const dockerStatus = this.checkDockerStatus();
    if (!dockerStatus.isRunning) {
      return {
        success: false,
        message:
          'Docker is not running. Please start Docker Desktop and try again.',
      };
    }
    try {
      if (projectName) {
        const projects = this.getProjects();
        const project = projects.find(
          (p) => p.name === projectName || p.siteId === projectName
        );
        if (!project) {
          return {
            success: false,
            message: `Project not found: ${projectName}. Available projects: ${projects.map((p) => p.name).join(', ') || 'none'}`,
          };
        }
        this.runCommand(`ddev start -p ${project.name}`);
        const updatedProject = this.getProjects().find(
          (p) => p.name === project.name
        );
        if (updatedProject?.status === 'running') {
          return {
            success: true,
            message: `Successfully started project "${project.name}". URL: ${updatedProject.url || 'N/A'}`,
          };
        } else {
          return {
            success: false,
            message: `Failed to start project "${project.name}". Check DDEV logs for details.`,
          };
        }
      } else {
        this.runCommand('ddev start');
        const runningProjects = this.getProjects().filter(
          (p) => p.status === 'running'
        );
        return {
          success: true,
          message: `Successfully started ${runningProjects.length} project(s): ${runningProjects.map((p) => p.name).join(', ')}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to start project(s): ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  stopProject(projectName?: string): { success: boolean; message: string } {
    if (!this.checkDDEVInstallation()) {
      return {
        success: false,
        message:
          'DDEV is not installed. Run "wfuwp local install dependencies" first.',
      };
    }
    try {
      if (projectName) {
        const projects = this.getProjects();
        const project = projects.find(
          (p) => p.name === projectName || p.siteId === projectName
        );
        if (!project) {
          return {
            success: false,
            message: `Project not found: ${projectName}. Available projects: ${projects.map((p) => p.name).join(', ') || 'none'}`,
          };
        }
        this.runCommand(`ddev stop -p ${project.name}`);
        const updatedProject = this.getProjects().find(
          (p) => p.name === project.name
        );
        if (updatedProject?.status !== 'running') {
          return {
            success: true,
            message: `Successfully stopped project "${project.name}".`,
          };
        } else {
          return {
            success: false,
            message: `Failed to stop project "${project.name}". Check DDEV logs for details.`,
          };
        }
      } else {
        this.runCommand('ddev stop');
        const runningProjects = this.getProjects().filter(
          (p) => p.status === 'running'
        );
        return {
          success: true,
          message:
            runningProjects.length > 0
              ? `Some projects may still be running: ${runningProjects.map((p) => p.name).join(', ')}`
              : 'Successfully stopped all projects.',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop project(s): ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  restartProject(projectName?: string): { success: boolean; message: string } {
    if (!this.checkDDEVInstallation()) {
      return {
        success: false,
        message:
          'DDEV is not installed. Run "wfuwp local install dependencies" first.',
      };
    }
    const dockerStatus = this.checkDockerStatus();
    if (!dockerStatus.isRunning) {
      return {
        success: false,
        message:
          'Docker is not running. Please start Docker Desktop and try again.',
      };
    }
    try {
      if (projectName) {
        const projects = this.getProjects();
        const project = projects.find(
          (p) => p.name === projectName || p.siteId === projectName
        );
        if (!project) {
          return {
            success: false,
            message: `Project not found: ${projectName}. Available projects: ${projects.map((p) => p.name).join(', ') || 'none'}`,
          };
        }
        this.runCommand(`ddev restart -p ${project.name}`);
        const updatedProject = this.getProjects().find(
          (p) => p.name === project.name
        );
        if (updatedProject?.status === 'running') {
          return {
            success: true,
            message: `Successfully restarted project "${project.name}". URL: ${updatedProject.url || 'N/A'}`,
          };
        } else {
          return {
            success: false,
            message: `Failed to restart project "${project.name}". Check DDEV logs for details.`,
          };
        }
      } else {
        this.runCommand('ddev restart');
        const runningProjects = this.getProjects().filter(
          (p) => p.status === 'running'
        );
        return {
          success: true,
          message: `Successfully restarted ${runningProjects.length} project(s): ${runningProjects.map((p) => p.name).join(', ')}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to restart project(s): ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
