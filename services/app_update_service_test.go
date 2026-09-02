package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

func TestNormalizeAppVersion(t *testing.T) {
	tests := []struct {
		name    string
		version string
		want    string
	}{
		{name: "plain", version: "1.2.3", want: "1.2.3"},
		{name: "tag prefix", version: "v1.2.3", want: "1.2.3"},
		{name: "surrounding whitespace", version: "  v0.0.1  ", want: "0.0.1"},
		{name: "development", version: "0.0.0-dev", want: "0.0.0-dev"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizeAppVersion(test.version); got != test.want {
				t.Fatalf("normalizeAppVersion(%q) = %q, want %q", test.version, got, test.want)
			}
		})
	}
}

func TestAppUpdatesEnabledFor(t *testing.T) {
	tests := []struct {
		name       string
		production bool
		goos       string
		goarch     string
		want       bool
	}{
		{name: "production windows amd64", production: true, goos: "windows", goarch: "amd64", want: true},
		{name: "development windows amd64", production: false, goos: "windows", goarch: "amd64", want: false},
		{name: "production windows arm64", production: true, goos: "windows", goarch: "arm64", want: false},
		{name: "production macOS", production: true, goos: "darwin", goarch: "amd64", want: false},
		{name: "production Linux", production: true, goos: "linux", goarch: "amd64", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := appUpdatesEnabledFor(test.production, test.goos, test.goarch); got != test.want {
				t.Fatalf("appUpdatesEnabledFor(%t, %q, %q) = %t, want %t", test.production, test.goos, test.goarch, got, test.want)
			}
		})
	}
}

func TestAppUpdateServiceDisabledBuildIsNoOp(t *testing.T) {
	fake := &fakeAppUpdater{}
	service := newTestAppUpdateService(t, fake, false)

	if err := service.CheckForUpdates(); err != nil {
		t.Fatalf("CheckForUpdates() error = %v", err)
	}
	service.applicationStarted()

	if got := fake.flowCallCount(); got != 0 {
		t.Fatalf("CheckAndInstall calls = %d, want 0", got)
	}
	if got := fake.checkCallCount(); got != 0 {
		t.Fatalf("Check calls = %d, want 0", got)
	}
}

func TestAppUpdateServiceSerializesManualAndBackgroundChecks(t *testing.T) {
	manualStarted := make(chan struct{})
	releaseManual := make(chan struct{})
	backgroundStarted := make(chan struct{}, 1)
	fake := &fakeAppUpdater{
		check: func(context.Context) (*updater.Release, error) {
			backgroundStarted <- struct{}{}
			return nil, nil
		},
		checkAndInstall: func(context.Context) error {
			close(manualStarted)
			<-releaseManual
			return nil
		},
	}
	service := newTestAppUpdateService(t, fake, true)

	manualDone := make(chan error, 1)
	go func() { manualDone <- service.CheckForUpdates() }()
	awaitSignal(t, manualStarted, "manual update flow to start")

	backgroundDone := make(chan struct{})
	go func() {
		service.runBackgroundCheck()
		close(backgroundDone)
	}()

	select {
	case <-backgroundStarted:
		t.Fatal("background check started while the manual flow held the coordinator lock")
	case <-time.After(50 * time.Millisecond):
	}

	close(releaseManual)
	if err := <-manualDone; err != nil {
		t.Fatalf("CheckForUpdates() error = %v", err)
	}
	awaitSignal(t, backgroundStarted, "background check after manual flow")
	awaitSignal(t, backgroundDone, "background check to finish")
}

func TestAppUpdateServiceStartsImmediatelyAndSchedulesSixHourlyChecks(t *testing.T) {
	checks := make(chan struct{}, 2)
	fake := &fakeAppUpdater{
		check: func(context.Context) (*updater.Release, error) {
			checks <- struct{}{}
			return nil, nil
		},
	}
	service := newTestAppUpdateService(t, fake, true)

	delays := make(chan time.Duration, 2)
	callbacks := make(chan func(), 2)
	service.afterFunc = func(delay time.Duration, callback func()) appUpdateTimer {
		delays <- delay
		callbacks <- callback
		return &fakeAppUpdateTimer{}
	}

	service.applicationStarted()
	service.applicationStarted()

	awaitSignal(t, checks, "startup background check")
	if delay := awaitValue(t, delays, "first scheduled delay"); delay != 6*time.Hour {
		t.Fatalf("scheduled delay = %v, want 6h", delay)
	}
	callback := awaitValue(t, callbacks, "scheduled callback")
	callback()
	awaitSignal(t, checks, "scheduled background check")
	if delay := awaitValue(t, delays, "rescheduled delay"); delay != 6*time.Hour {
		t.Fatalf("rescheduled delay = %v, want 6h", delay)
	}

	if got := fake.checkCallCount(); got != 2 {
		t.Fatalf("Check calls = %d, want 2", got)
	}
}

func TestAppUpdateServiceBackgroundFailureOnlyLogs(t *testing.T) {
	checkErr := errors.New("provider unavailable")
	fake := &fakeAppUpdater{
		check: func(context.Context) (*updater.Release, error) {
			return nil, checkErr
		},
	}
	service := newTestAppUpdateService(t, fake, true)

	var logged string
	service.logf = func(format string, args ...any) {
		logged = format
		if len(args) > 0 {
			logged += ": " + args[0].(error).Error()
		}
	}
	service.runBackgroundCheck()

	if got := fake.flowCallCount(); got != 0 {
		t.Fatalf("CheckAndInstall calls = %d, want 0", got)
	}
	if !strings.Contains(logged, checkErr.Error()) {
		t.Fatalf("background error log = %q, want it to contain %q", logged, checkErr)
	}
}

func TestAppUpdateServiceBackgroundReleaseOpensUpdaterFlow(t *testing.T) {
	fake := &fakeAppUpdater{
		check: func(context.Context) (*updater.Release, error) {
			return &updater.Release{Version: "2.0.0"}, nil
		},
	}
	service := newTestAppUpdateService(t, fake, true)

	service.runBackgroundCheck()

	if got := fake.flowCallCount(); got != 1 {
		t.Fatalf("CheckAndInstall calls = %d, want 1", got)
	}
}

type fakeAppUpdater struct {
	mu              sync.Mutex
	checkCalls      int
	flowCalls       int
	check           func(context.Context) (*updater.Release, error)
	checkAndInstall func(context.Context) error
}

func (f *fakeAppUpdater) Check(ctx context.Context) (*updater.Release, error) {
	f.mu.Lock()
	f.checkCalls++
	check := f.check
	f.mu.Unlock()
	if check != nil {
		return check(ctx)
	}
	return nil, nil
}

func (f *fakeAppUpdater) CheckAndInstall(ctx context.Context) error {
	f.mu.Lock()
	f.flowCalls++
	checkAndInstall := f.checkAndInstall
	f.mu.Unlock()
	if checkAndInstall != nil {
		return checkAndInstall(ctx)
	}
	return nil
}

func (f *fakeAppUpdater) checkCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.checkCalls
}

func (f *fakeAppUpdater) flowCallCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.flowCalls
}

type fakeAppUpdateTimer struct {
	stopped atomic.Bool
}

func (t *fakeAppUpdateTimer) Stop() bool {
	return t.stopped.CompareAndSwap(false, true)
}

func newTestAppUpdateService(t *testing.T, client appUpdater, enabled bool) *AppUpdateService {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	service := &AppUpdateService{
		currentVersion: "1.0.0",
		updater:        client,
		enabled:        enabled,
		ctx:            ctx,
		cancel:         cancel,
		interval:       appUpdateCheckInterval,
		afterFunc: func(time.Duration, func()) appUpdateTimer {
			return &fakeAppUpdateTimer{}
		},
		logf: func(string, ...any) {},
	}
	t.Cleanup(func() { _ = service.ServiceShutdown() })
	return service
}

func awaitSignal(t *testing.T, ch <-chan struct{}, description string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", description)
	}
}

func awaitValue[T any](t *testing.T, ch <-chan T, description string) T {
	t.Helper()
	select {
	case value := <-ch:
		return value
	case <-time.After(time.Second):
		t.Fatalf("timed out waiting for %s", description)
		var zero T
		return zero
	}
}
