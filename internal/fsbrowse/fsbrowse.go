// Package fsbrowse provides secure filesystem browsing under allowed root folders.
package fsbrowse

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Service handles filesystem browsing with security checks.
type Service struct {
	allowedRoots []string
}

// New creates a new Service from a comma-separated list of allowed root paths.
func New(rootsCSV string) *Service {
	var roots []string
	for _, r := range strings.Split(rootsCSV, ",") {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		if abs, err := filepath.Abs(r); err == nil {
			roots = append(roots, abs)
		}
	}
	return &Service{allowedRoots: roots}
}

// Entry represents a filesystem entry returned to the client.
type Entry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  int64  `json:"size"`
}

// Browse lists the contents of a directory, checking that the path is under
// an allowed root. Returns up to maxEntries entries (default 200).
func (s *Service) Browse(dirPath string, maxEntries int) ([]Entry, error) {
	if maxEntries <= 0 {
		maxEntries = 200
	}

	absPath, err := filepath.Abs(dirPath)
	if err != nil {
		return nil, err
	}

	if err := s.checkAllowed(absPath); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}

	// Separate dirs and files, sort each alphabetically (dirs first)
	var dirs, files []Entry
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") && e.Name() != "." {
			continue // skip hidden files except .
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		entryPath := filepath.Join(absPath, e.Name())
		if e.IsDir() {
			dirs = append(dirs, Entry{
				Name:  e.Name(),
				Path:  entryPath,
				IsDir: true,
			})
		} else {
			files = append(files, Entry{
				Name:  e.Name(),
				Path:  entryPath,
				IsDir: false,
				Size:  info.Size(),
			})
		}
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })
	sort.Slice(files, func(i, j int) bool { return files[i].Name < files[j].Name })

	result := append(dirs, files...)
	if len(result) > maxEntries {
		result = result[:maxEntries]
	}

	return result, nil
}

// Search searches for files/directories under a root matching a query (case-insensitive substring).
// Returns up to maxResults matches.
func (s *Service) Search(rootPath, query string, maxResults int) ([]Entry, error) {
	if maxResults <= 0 {
		maxResults = 50
	}

	absRoot, err := filepath.Abs(rootPath)
	if err != nil {
		return nil, err
	}

	if err := s.checkAllowed(absRoot); err != nil {
		return nil, err
	}

	query = strings.ToLower(query)
	var results []Entry

	// Walk up to depth 3 for performance
	err = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip errors
		}

		// Calculate depth
		rel, err := filepath.Rel(absRoot, path)
		if err != nil {
			return nil
		}
		depth := len(strings.Split(rel, string(filepath.Separator)))
		if depth > 3 {
			return filepath.SkipDir
		}

		// Skip hidden files/dirs
		name := d.Name()
		if strings.HasPrefix(name, ".") {
			if d.IsDir() && name != "." {
				return filepath.SkipDir
			}
			return nil
		}

		if strings.Contains(strings.ToLower(name), query) {
			info, err := d.Info()
			if err != nil {
				return nil
			}
			results = append(results, Entry{
				Name:  name,
				Path:  path,
				IsDir: d.IsDir(),
				Size:  info.Size(),
			})
			if len(results) >= maxResults {
				return filepath.SkipDir
			}
		}

		return nil
	})

	return results, err
}

// checkAllowed verifies that a path is under one of the allowed root directories.
func (s *Service) checkAllowed(path string) error {
	for _, root := range s.allowedRoots {
		if strings.HasPrefix(path, root+string(filepath.Separator)) || path == root {
			return nil
		}
	}
	return &NotAllowedError{Path: path}
}

// ReadFile reads a small file (up to maxSize bytes) if it's under an allowed root.
// Used for @ mention file previews.
func (s *Service) ReadFile(filePath string, maxSize int) (string, error) {
	if maxSize <= 0 {
		maxSize = 32 * 1024 // 32KB default
	}

	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return "", err
	}

	if err := s.checkAllowed(absPath); err != nil {
		return "", err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", &NotAllowedError{Path: filePath}
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	if len(data) > maxSize {
		data = data[:maxSize]
	}

	return string(data), nil
}

// AllowedRoots returns the configured allowed root paths.
func (s *Service) AllowedRoots() []string {
	return s.allowedRoots
}

// NotAllowedError is returned when a path is outside allowed roots.
type NotAllowedError struct {
	Path string
}

func (e *NotAllowedError) Error() string {
	return "path not allowed: " + e.Path
}
