import { describe, it, expect } from 'vitest';
import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('Build Configuration Tests', () => {
  describe('tauri.conf.json validation', () => {
    it('should have bundle active', () => {
      // Verifies AC #1: Bundle configuration is enabled
      expect(tauriConfig.bundle.active).toBe(true);
    });

    it('should have valid bundle identifier', () => {
      // Verifies bundle identifier format (com.domain.app)
      expect(tauriConfig.identifier).toMatch(/^com\.[a-z]+\.[a-z]+$/);
    });

    it('should have icon configuration', () => {
      // Verifies AC #3: Icon is configured
      expect(tauriConfig.bundle.icon).toBeDefined();
      expect(Array.isArray(tauriConfig.bundle.icon)).toBe(true);
      expect(tauriConfig.bundle.icon.length).toBeGreaterThan(0);
    });

    it('should have macOS icon in config', () => {
      // Verifies macOS ICNS icon is referenced
      expect(tauriConfig.bundle.icon).toContain('icons/icon.icns');
    });

    it('should have macOS minimum version configured', () => {
      // Verifies macOS 12+ requirement from PRD
      expect(tauriConfig.bundle.macOS).toBeDefined();
      expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe('12.0');
    });

    it('should have build commands configured', () => {
      // Verifies build pipeline configuration
      expect(tauriConfig.build.beforeBuildCommand).toBe('npm run build');
      expect(tauriConfig.build.frontendDist).toBe('../dist');
    });
  });
});
