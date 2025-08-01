import { describe, it, expect, vi, beforeEach } from 'vitest';
import chalk from 'chalk';
import * as console from '../../../lib/utils/console.js';

describe('console utilities', () => {
  let mockConsoleLog;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(global.console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  describe('message functions', () => {
    it('should display success message', () => {
      console.success('Operation completed');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✓ Operation completed'));
    });

    it('should display success message with custom icon', () => {
      console.success('Done', '✅');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.green('✅ Done'));
    });

    it('should display error message', () => {
      console.error('Operation failed');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.red('❌ Operation failed'));
    });

    it('should display warning message', () => {
      console.warning('Be careful');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.yellow('⚠ Be careful'));
    });

    it('should display info message', () => {
      console.info('Information');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.cyan('ℹ Information'));
    });

    it('should display debug message', () => {
      console.debug('Debug info');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.gray('Debug info'));
    });
  });

  describe('formatting functions', () => {
    it('should display header', () => {
      console.header('Test Title');

      expect(mockConsoleLog).toHaveBeenCalledTimes(3);
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\n╔══════════════╗'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('║  Test Title  ║'));
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('╚══════════════╝\n'));
    });

    it('should display section', () => {
      console.section('Section Name');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\n📁 Section Name'));
    });

    it('should display section with custom icon', () => {
      console.section('Info', '📊');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.bold('\n📊 Info'));
    });

    it('should display list', () => {
      console.list(['Item 1', 'Item 2', 'Item 3']);

      expect(mockConsoleLog).toHaveBeenCalledTimes(3);
      expect(mockConsoleLog).toHaveBeenCalledWith('  - Item 1');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - Item 2');
      expect(mockConsoleLog).toHaveBeenCalledWith('  - Item 3');
    });

    it('should display list with custom options', () => {
      console.list(['A', 'B'], { indent: '    ', bullet: '•' });

      expect(mockConsoleLog).toHaveBeenCalledWith('    • A');
      expect(mockConsoleLog).toHaveBeenCalledWith('    • B');
    });

    it('should display key-value pair', () => {
      console.keyValue('Name', 'John Doe');
      expect(mockConsoleLog).toHaveBeenCalledWith(`  ${chalk.gray('Name')}: John Doe`);
    });

    it('should display key-value with custom options', () => {
      console.keyValue('Age', '25', { indent: '', separator: ' = ' });
      expect(mockConsoleLog).toHaveBeenCalledWith(`${chalk.gray('Age')} =  25`);
    });

    it('should display progress', () => {
      console.progress(7, 10);
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.blue('Progress: 7/10 (70%)'));
    });

    it('should display progress with custom label', () => {
      console.progress(50, 100, 'Completed');
      expect(mockConsoleLog).toHaveBeenCalledWith(chalk.blue('Completed: 50/100 (50%)'));
    });
  });

  describe('utility functions', () => {
    it('should format cost with dollar sign', () => {
      const result = console.cost(12.3456);
      expect(result).toBe(chalk.yellow('$12.3456'));
    });

    it('should format cost with custom currency', () => {
      const result = console.cost(99.99, '€');
      expect(result).toBe(chalk.yellow('€99.9900'));
    });

    it('should format cost from string', () => {
      const result = console.cost('5.00');
      expect(result).toBe(chalk.yellow('$5.00'));
    });

    it('should format model info without price', () => {
      const result = console.modelInfo('gpt-4');
      expect(result).toBe('gpt-4');
    });

    it('should format model info with price', () => {
      const result = console.modelInfo('gpt-4', 0.03);
      expect(result).toBe(`gpt-4 (${chalk.yellow('$0.0300')}/M tokens)`);
    });

    it('should format bytes', () => {
      expect(console.formatBytes(500)).toBe('500.00 B');
      expect(console.formatBytes(1536)).toBe('1.50 KB');
      expect(console.formatBytes(1048576)).toBe('1.00 MB');
      expect(console.formatBytes(1073741824)).toBe('1.00 GB');
    });

    it('should format duration', () => {
      expect(console.formatDuration(500)).toBe('500ms');
      expect(console.formatDuration(1500)).toBe('1.5s');
      expect(console.formatDuration(65000)).toBe('1m 5s');
      expect(console.formatDuration(125000)).toBe('2m 5s');
    });
  });
});
