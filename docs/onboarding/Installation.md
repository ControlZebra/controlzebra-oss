# Install ControlZebra on Windows

Download `control-zebra-amd64-installer.exe` from the
[latest ControlZebra release](https://github.com/ControlZebra/controlzebra-oss/releases/latest).
The installer is for Windows x64. The separately published
`control-zebra-windows-amd64.exe` is the application update artifact; use the
installer for your first installation.

1. Open the downloaded installer and review the license agreement.
2. Follow the installer steps. The default location is
   `%LOCALAPPDATA%\Programs\ControlZebra` for your Windows account.
3. Launch **ControlZebra** from the Start menu or desktop shortcut.
4. Complete the in-app setup for the project tools you need.

Keep Windows security protection enabled. If Windows blocks the installer,
check that it came from the official release and review its digital signature
in the file's Properties. Contact support if the signature is missing or invalid.

## Get updates

Production Windows x64 builds check for stable releases at startup and every
six hours. You can also open **Settings → General → Check for updates**.
The update window shows download and verification progress. Choose
**Restart & Apply** when the update is ready.

A skipped version is remembered until the application exits. Development builds
and other platforms do not self-update. Older versions that use the retired
release feed should be upgraded by running the current installer.

## Uninstall

Remove ControlZebra from Windows **Settings → Apps → Installed apps**.
The uninstaller offers an optional action to remove user data; select it only
if you also want to remove application settings and local tool data.
