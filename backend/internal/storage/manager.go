package storage

import (
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Config holds the storage manager configuration
type Config struct {
	Directory       string        // Directory to monitor
	MaxSizeBytes    int64         // Maximum total size in bytes
	LowWaterMark    float64       // Cleanup until this percentage of max (e.g., 0.90 = 90%)
	CheckInterval   time.Duration // How often to check disk usage
	MinRetention    time.Duration // Minimum time to keep files (optional safety)
	FilePattern     string        // Glob pattern for files to manage (e.g., "*.pcap")
	ProtectedFiles  func() []string // Optional callback to get list of files to protect from deletion
}

// Manager handles storage cleanup for PCAP files
type Manager struct {
	config     Config
	stopChan   chan struct{}
	wg         sync.WaitGroup
	mutex      sync.Mutex
	running    bool
	stats      Stats
	statsMutex sync.RWMutex
}

// Stats holds current storage statistics
type Stats struct {
	TotalFiles     int
	TotalSizeBytes int64
	OldestFile     time.Time
	NewestFile     time.Time
	LastCleanup    time.Time
	FilesDeleted   int64
	BytesFreed     int64
}

// FileInfo holds information about a managed file
type FileInfo struct {
	Path    string
	Size    int64
	ModTime time.Time
}

// NewManager creates a new storage manager
func NewManager(config Config) *Manager {
	// Set defaults
	if config.LowWaterMark == 0 {
		config.LowWaterMark = 0.90 // Default to 90%
	}
	if config.CheckInterval == 0 {
		config.CheckInterval = 30 * time.Second
	}
	if config.FilePattern == "" {
		config.FilePattern = "*.pcap"
	}

	return &Manager{
		config:   config,
		stopChan: make(chan struct{}),
	}
}

// Start begins the storage monitoring goroutine
func (m *Manager) Start() error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if m.running {
		return nil
	}

	// Ensure directory exists
	if err := os.MkdirAll(m.config.Directory, 0755); err != nil {
		return err
	}

	m.running = true
	m.wg.Add(1)

	go m.monitorLoop()

	log.Printf("📦 Storage Manager started: monitoring %s (max: %.2f GB, low watermark: %.0f%%)",
		m.config.Directory,
		float64(m.config.MaxSizeBytes)/(1024*1024*1024),
		m.config.LowWaterMark*100)

	return nil
}

// Stop gracefully stops the storage manager
func (m *Manager) Stop() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if !m.running {
		return
	}

	close(m.stopChan)
	m.wg.Wait()
	m.running = false

	log.Printf("📦 Storage Manager stopped")
}

// GetStats returns current storage statistics
func (m *Manager) GetStats() Stats {
	m.statsMutex.RLock()
	defer m.statsMutex.RUnlock()
	return m.stats
}

// monitorLoop is the main monitoring goroutine
func (m *Manager) monitorLoop() {
	defer m.wg.Done()

	// Run immediately on start
	m.checkAndCleanup()

	ticker := time.NewTicker(m.config.CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			m.checkAndCleanup()
		}
	}
}

// checkAndCleanup checks disk usage and cleans up if necessary
func (m *Manager) checkAndCleanup() {
	files, err := m.getFiles()
	if err != nil {
		log.Printf("⚠️ Storage Manager: failed to list files: %v", err)
		return
	}

	// Calculate total size and update stats
	var totalSize int64
	var oldestTime, newestTime time.Time

	for i, f := range files {
		totalSize += f.Size
		if i == 0 || f.ModTime.Before(oldestTime) {
			oldestTime = f.ModTime
		}
		if i == 0 || f.ModTime.After(newestTime) {
			newestTime = f.ModTime
		}
	}

	m.statsMutex.Lock()
	m.stats.TotalFiles = len(files)
	m.stats.TotalSizeBytes = totalSize
	m.stats.OldestFile = oldestTime
	m.stats.NewestFile = newestTime
	m.statsMutex.Unlock()

	// Check if cleanup is needed
	if totalSize > m.config.MaxSizeBytes {
		m.performCleanup(files, totalSize)
	}
}

// getFiles returns all managed files sorted by modification time (oldest first)
func (m *Manager) getFiles() ([]FileInfo, error) {
	pattern := filepath.Join(m.config.Directory, m.config.FilePattern)
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}

	var files []FileInfo
	for _, path := range matches {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if info.IsDir() {
			continue
		}

		files = append(files, FileInfo{
			Path:    path,
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}

	// Sort by modification time (oldest first)
	sort.Slice(files, func(i, j int) bool {
		return files[i].ModTime.Before(files[j].ModTime)
	})

	return files, nil
}

// performCleanup removes oldest files until under low watermark
func (m *Manager) performCleanup(files []FileInfo, currentSize int64) {
	targetSize := int64(float64(m.config.MaxSizeBytes) * m.config.LowWaterMark)
	bytesToFree := currentSize - targetSize

	log.Printf("🧹 Storage cleanup needed: %.2f GB used, target %.2f GB (freeing %.2f GB)",
		float64(currentSize)/(1024*1024*1024),
		float64(targetSize)/(1024*1024*1024),
		float64(bytesToFree)/(1024*1024*1024))

	var freedBytes int64
	var deletedCount int

	minRetentionCutoff := time.Now().Add(-m.config.MinRetention)

	// Get list of protected files (e.g., files being used for historical playback)
	protectedFiles := make(map[string]bool)
	if m.config.ProtectedFiles != nil {
		for _, pf := range m.config.ProtectedFiles() {
			protectedFiles[pf] = true
		}
		if len(protectedFiles) > 0 {
			log.Printf("🛡️ Protecting %d files in use for playback", len(protectedFiles))
		}
	}

	for _, f := range files {
		if freedBytes >= bytesToFree {
			break
		}

		// Skip protected files (in use for historical playback)
		if protectedFiles[f.Path] {
			log.Printf("🛡️ Skipping %s (protected - in use)", filepath.Base(f.Path))
			continue
		}

		// Skip files within minimum retention period
		if m.config.MinRetention > 0 && f.ModTime.After(minRetentionCutoff) {
			log.Printf("⏳ Skipping %s (within minimum retention period)", filepath.Base(f.Path))
			continue
		}

		// Delete the file
		if err := os.Remove(f.Path); err != nil {
			log.Printf("⚠️ Failed to delete %s: %v", filepath.Base(f.Path), err)
			continue
		}

		freedBytes += f.Size
		deletedCount++
		log.Printf("🗑️ Deleted: %s (%.2f MB, age: %s)",
			filepath.Base(f.Path),
			float64(f.Size)/(1024*1024),
			time.Since(f.ModTime).Round(time.Minute))
	}

	m.statsMutex.Lock()
	m.stats.LastCleanup = time.Now()
	m.stats.FilesDeleted += int64(deletedCount)
	m.stats.BytesFreed += freedBytes
	m.statsMutex.Unlock()

	log.Printf("✅ Cleanup complete: deleted %d files, freed %.2f GB",
		deletedCount, float64(freedBytes)/(1024*1024*1024))
}

// ForceCleanup triggers an immediate cleanup check
func (m *Manager) ForceCleanup() {
	go m.checkAndCleanup()
}

// GetUsagePercent returns current storage usage as a percentage
func (m *Manager) GetUsagePercent() float64 {
	m.statsMutex.RLock()
	defer m.statsMutex.RUnlock()

	if m.config.MaxSizeBytes == 0 {
		return 0
	}
	return float64(m.stats.TotalSizeBytes) / float64(m.config.MaxSizeBytes) * 100
}
