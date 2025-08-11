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
}

export interface DockerStatus {
  isInstalled: boolean;
  version?: string;
  isRunning: boolean;
}

export class DDEVManager {
  checkDockerStatus(): DockerStatus {
    throw new Error(
      'DDEVManager.checkDockerStatus() will be implemented in Phase 3'
    );
  }

  checkDDEVInstallation(): boolean {
    throw new Error(
      'DDEVManager.checkDDEVInstallation() will be implemented in Phase 3'
    );
  }

  getDDEVVersion(): string | null {
    throw new Error(
      'DDEVManager.getDDEVVersion() will be implemented in Phase 3'
    );
  }

  getStatus(): DDEVStatus {
    throw new Error('DDEVManager.getStatus() will be implemented in Phase 3');
  }

  startProject(): void {
    throw new Error(
      'DDEVManager.startProject() will be implemented in Phase 5'
    );
  }

  stopProject(): void {
    throw new Error('DDEVManager.stopProject() will be implemented in Phase 5');
  }

  restartProject(): void {
    throw new Error(
      'DDEVManager.restartProject() will be implemented in Phase 5'
    );
  }

  getProjects(): DDEVProject[] {
    throw new Error('DDEVManager.getProjects() will be implemented in Phase 3');
  }
}
