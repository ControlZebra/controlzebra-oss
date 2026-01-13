package main

import (
	"embed"
	_ "embed"
	"log"
	"runtime"
	"time"

	"changeme/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

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

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Bind' is a list of Go struct instances. The frontend has access to the methods of these instances.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "rewind-logic",
		Description: "A simplified Git client for industrial automation users",
		Services: []application.Service{
			application.NewService(services.NewGitService()),
			application.NewService(services.NewLFSService()),
			application.NewService(settingsService),
			application.NewService(services.NewFileSystemService()),
			application.NewService(fileDialogService),
			application.NewService(terminalService),
			application.NewService(progressService),
			application.NewService(repoSettingsService),
			application.NewService(fileWatcherService),
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
				// Emit event to frontend with the selected path
				app.Event.Emit("folder-selected", result.Path)
			}
		})

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

	// Set the application menu
	app.Menu.SetApplicationMenu(menu)

	// Create a new window with the necessary options.
	// 'Title' is the title of the window.
	// 'Mac' options tailor the window when running on macOS.
	// 'BackgroundColour' is the background colour of the window.
	// 'URL' is the URL that will be loaded into the webview.
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Window 1",
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
