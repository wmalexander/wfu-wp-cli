import { execSync } from 'child_process';
import { platform } from 'os';

export interface NotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
}

export class Notifications {
  static send(options: NotificationOptions): void {
    try {
      const os = platform();

      switch (os) {
        case 'darwin':
          this.sendMacNotification(options);
          break;
        case 'linux':
          this.sendLinuxNotification(options);
          break;
        case 'win32':
          this.sendWindowsNotification(options);
          break;
        default:
          break;
      }
    } catch (error) {
      // Silently fail - notifications are non-critical
    }
  }
  private static sendMacNotification(options: NotificationOptions): void {
    const soundArg = options.sound !== false ? 'sound name "Glass"' : '';
    const command = `osascript -e 'display notification "${this.escapeForAppleScript(options.message)}" with title "${this.escapeForAppleScript(options.title)}" ${soundArg}'`;
    execSync(command, { stdio: 'ignore' });
  }
  private static sendLinuxNotification(options: NotificationOptions): void {
    try {
      execSync('which notify-send', { stdio: 'ignore' });
      const urgency = options.sound !== false ? '-u critical' : '-u normal';
      const command = `notify-send ${urgency} "${this.escapeForShell(options.title)}" "${this.escapeForShell(options.message)}"`;
      execSync(command, { stdio: 'ignore' });
    } catch {
      // notify-send not available
    }
  }
  private static sendWindowsNotification(options: NotificationOptions): void {
    const psCommand = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

      $template = @"
      <toast>
        <visual>
          <binding template="ToastText02">
            <text id="1">${this.escapeForPowerShell(options.title)}</text>
            <text id="2">${this.escapeForPowerShell(options.message)}</text>
          </binding>
        </visual>
      </toast>
"@

      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("wfuwp").Show($toast)
    `.trim();
    execSync(`powershell -Command "${psCommand}"`, { stdio: 'ignore' });
  }
  private static escapeForAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
  private static escapeForShell(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  }
  private static escapeForPowerShell(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
