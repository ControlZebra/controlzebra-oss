package main

import (
	"embed"
	_ "embed"
	"fmt"
	"log"
	"runtime"
	"time"

	"controlzebra/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Version is set at build time via -ldflags "-X main.Version=x.y.z".
// Defaults to "0.0.0-dev" for local development builds.
var Version = "0.0.0-dev"

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	// Register a custom event whose associated data type is string.
	// This is not required, but the binding generator will pick up registered events
	// and provide a strongly typed JS/TS API for them.
	application.RegisterEvent[string]("time")
	application.RegisterEvent[string]("folder-selected")
	application.RegisterEvent[string]("folder-closed")

	// File menu events
	application.RegisterEvent[string]("file:reveal-in-finder")
	application.RegisterEvent[string]("file:open-in-terminal")

	// Terminal events - dynamic event names based on session ID
	// These are registered as patterns, actual events use session-specific suffixes
}

// main function serves as the application's entry point. It initializes the application, creates a window,
// and starts a goroutine that emits a time-based event every second. It subsequently runs the application and
// logs any error that might occur.
func main() {

	// Create services that need app reference
	fileDialogService := services.NewFileDialogService()
	terminalService := services.NewTerminalService()
	progressService := services.NewProgressService()
	settingsService := services.NewSettingsService()
	repoSettingsService := services.NewRepositorySettingsService()
	fileWatcherService := services.NewFileWatcherService()
	fileSystemService := services.NewFileSystemService()
	authService := services.NewAuthService()
	updaterService := services.NewUpdaterService(Version, "https://controlzebra.github.io/controlzebra-releases/desktop/beta/")

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "control-zebra",
		Description: "A simplified Git client for industrial automation users",
		Services: []application.Service{
			application.NewService(services.NewGitService()),
			application.NewService(services.NewLFSService()),
			application.NewService(services.NewGitHubService()),
			application.NewService(settingsService),
			application.NewService(fileSystemService),
			application.NewService(fileDialogService),
			application.NewService(terminalService),
			application.NewService(progressService),
			application.NewService(repoSettingsService),
			application.NewService(fileWatcherService),
			application.NewService(authService),
			application.NewService(updaterService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Set app reference for services that need it
	fileDialogService.SetApp(app)
	terminalService.SetApp(app)
	progressService.SetApp(app)
	settingsService.SetApp(app)
	repoSettingsService.SetApp(app)
	fileWatcherService.SetApp(app)
	updaterService.SetApp(app)

	// Create application menu
	menu := app.NewMenu()

	// On macOS, add the standard app menu (About, Preferences, Quit)
	if runtime.GOOS == "darwin" {
		menu.AddRole(application.AppMenu)
	}

	// File menu with Open Folder
	fileMenu := menu.AddSubmenu("File")
	fileMenu.Add("Open Folder...").
		SetAccelerator("CmdOrCtrl+O").
		OnClick(func(ctx *application.Context) {
			// Open the folder dialog
			result := fileDialogService.OpenFolderDialog()
			if result.Selected && result.Path != "" {
				// Add to recent folders
				_ = settingsService.AddRecentFolder(result.Path)
				// Emit event to frontend with the selected path
				app.Event.Emit("folder-selected", result.Path)
			}
		})

	// Open Recent submenu
	openRecentMenu := fileMenu.AddSubmenu("Open Recent")

	// Helper function to rebuild the Open Recent menu
	// Declare as variable first to allow recursive reference
	var rebuildOpenRecentMenu func()
	rebuildOpenRecentMenu = func() {
		// Clear existing items
		openRecentMenu.Clear()

		recentFolders := settingsService.GetRecentFolders()
		if len(recentFolders) == 0 {
			openRecentMenu.Add("(No Recent Folders)").SetEnabled(false)
		} else {
			for _, folder := range recentFolders {
				folderPath := folder // capture for closure
				openRecentMenu.Add(folderPath).OnClick(func(ctx *application.Context) {
					_ = settingsService.AddRecentFolder(folderPath)
					app.Event.Emit("folder-selected", folderPath)
				})
			}
			openRecentMenu.AddSeparator()
			openRecentMenu.Add("Clear Recent").OnClick(func(ctx *application.Context) {
				_ = settingsService.ClearRecentFolders()
				rebuildOpenRecentMenu()
			})
		}
	}

	// Build initial recent menu
	rebuildOpenRecentMenu()

	fileMenu.AddSeparator()

	// Reveal in Finder/Explorer - emits event, frontend calls with current repo path
	revealLabel := "Reveal in Explorer"
	if runtime.GOOS == "darwin" {
		revealLabel = "Reveal in Finder"
	}
	fileMenu.Add(revealLabel).OnClick(func(ctx *application.Context) {
		app.Event.Emit("file:reveal-in-finder", "")
	})

	// Open in External Terminal
	fileMenu.Add("Open in External Terminal").OnClick(func(ctx *application.Context) {
		app.Event.Emit("file:open-in-terminal", "")
	})

	fileMenu.AddSeparator()

	fileMenu.Add("Close Folder").
		SetAccelerator("CmdOrCtrl+W").
		OnClick(func(ctx *application.Context) {
			// Emit event to frontend to close the current folder
			app.Event.Emit("folder-closed", "")
		})

	if runtime.GOOS != "darwin" {
		// On Windows/Linux, add a separator and Quit option
		fileMenu.AddSeparator()
		fileMenu.Add("Exit").
			SetAccelerator("Alt+F4").
			OnClick(func(ctx *application.Context) {
				app.Quit()
			})
	}

	// Help menu
	helpMenu := menu.AddSubmenu("Help")
	helpMenu.Add("Check for Updates...").OnClick(func(ctx *application.Context) {
		app.Event.Emit("updater:manual-check", "")
	})
	helpMenu.AddSeparator()
	helpMenu.Add("Documentation").OnClick(func(ctx *application.Context) {
		fileSystemService.OpenURL("https://controlzebra.com/docs")
	})
	helpMenu.Add("Report Issue").OnClick(func(ctx *application.Context) {
		fileSystemService.OpenURL("https://github.com/ControlZebra/controlzebra-releases/issues")
	})

	// About dialog (Windows/Linux only - macOS uses AppMenu role)
	if runtime.GOOS != "darwin" {
		helpMenu.AddSeparator()
		helpMenu.Add("About ControlZebra").OnClick(func(ctx *application.Context) {
			// Create a simple about dialog window
			aboutWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
				Title:            "About ControlZebra",
				Width:            400,
				Height:           300,
				DisableResize:    true,
				BackgroundColour: application.NewRGB(30, 30, 30),
				URL:              "about:blank",
			})
			aboutHTML := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
<style>
body {
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	background: #1e1e1e;
	color: #e0e0e0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 100vh;
	margin: 0;
	padding: 20px;
	box-sizing: border-box;
	text-align: center;
}
h1 { font-size: 24px; margin: 0 0 8px 0; color: #fff; }
.version { font-size: 14px; color: #888; margin-bottom: 16px; }
.description { font-size: 13px; color: #aaa; line-height: 1.5; max-width: 300px; }
.copyright { font-size: 11px; color: #666; margin-top: 20px; }
</style>
</head>
<body>
<h1>ControlZebra</h1>
<div class="version">Version %s</div>
<div class="description">A simplified Git client for industrial automation users. Manage version control without the complexity.</div>
<div class="copyright">© 2026 ControlZebra</div>
</body>
</html>
`, Version)
			aboutWindow.SetHTML(aboutHTML)
		})
	}

	// Set the application menu
	app.Menu.SetApplicationMenu(menu)

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "ControlZebra (Beta)",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(10, 10, 10),
		URL:              "/",
	})

	// Create a goroutine that emits an event containing the current time every second.
	// The frontend can listen to this event and update the UI accordingly.
	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			time.Sleep(time.Second)
		}
	}()

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
