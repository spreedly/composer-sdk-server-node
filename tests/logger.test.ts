import { Logger, LogEntry, ComposerLogLevel, Severity, DodgeballLogLevel } from "../src/logger";
import { vi } from "vitest";

describe("Logger", () => {
  let consoleSpy: any;

  beforeEach(() => {
    // Reset Logger filter level for these tests
    Logger.filterLevel = Severity.TRACE;
    // Get reference to console.log mock
    consoleSpy = vi.mocked(console.log);
    consoleSpy.mockClear();
  });

  describe("formatError", () => {
    test("should handle Error instances", () => {
      const error = new Error("Test error message");
      error.stack = "Error: Test error message\n    at test.js:10:15";
      
      const formatted = Logger.formatError(error);
      
      expect(formatted).toContain("message: Test error message");
      expect(formatted).toContain("stack: Error: Test error message\n    at test.js:10:15");
      expect(formatted).toContain("name: Error");
    });

    test("should handle non-Error objects", () => {
      const error = { message: "Custom error" };
      const formatted = Logger.formatError(error);
      
      expect(formatted).toBe("[object Object]");
    });

    test("should handle null/undefined errors", () => {
      expect(Logger.formatError(null)).toBe("");
      expect(Logger.formatError(undefined)).toBe("");
    });

    test("should handle string errors", () => {
      const formatted = Logger.formatError("String error");
      expect(formatted).toBe("String error");
    });
  });

  describe("LogEntry", () => {
    test("should create LogEntry with defaults", () => {
      const entry = new LogEntry("Test message");
      
      expect(entry.message).toBe("Test message");
      expect(entry.severity).toBe(Severity.INFO);
      expect(entry.error).toBeNull();
      expect(entry.date).toBeInstanceOf(Date);
    });

    test("should create LogEntry with custom severity and error", () => {
      const error = new Error("Test error");
      const entry = new LogEntry("Error message", Severity.ERROR, error);
      
      expect(entry.message).toBe("Error message");
      expect(entry.severity).toBe(Severity.ERROR);
      expect(entry.error).toBe(error);
    });

    test("should create LogEntry with TRACE severity", () => {
      const entry = new LogEntry("Trace message", Severity.TRACE);
      
      expect(entry.message).toBe("Trace message");
      expect(entry.severity).toBe(Severity.TRACE);
      expect(entry.error).toBeNull();
    });

    test("should create LogEntry with NONE severity", () => {
      const entry = new LogEntry("None message", Severity.NONE);
      
      expect(entry.message).toBe("None message");
      expect(entry.severity).toBe(Severity.NONE);
    });

    test("should log with parameters", () => {
      const params = { userId: "123", action: "test" };
      Logger.info("Test message", params).log();
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("Test message");
      expect(output).toContain("parameters:");
    });

    test("should log errors with formatError", () => {
      const error = new Error("Test error");
      Logger.error("Error occurred", error).log();
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("Error occurred");
      expect(output).toContain("message:");
    });

    test("should log without parameters", () => {
      Logger.info("Simple message").log();
      
      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("Simple message");
      expect(output).toContain("INFO");
    });

    test("should log with filter level NONE (logs nothing)", () => {
      consoleSpy.mockClear();
      Logger.filterLevel = Severity.NONE;
      
      Logger.trace("Trace message").log();
      Logger.info("Info message").log();
      Logger.error("Error message").log();
      
      // Nothing should be logged when filter level is NONE
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("should respect filter level", () => {
      Logger.filterLevel = Severity.ERROR;
      
      Logger.trace("Trace message").log();
      Logger.info("Info message").log();
      Logger.error("Error message").log();
      
      // Only error should be logged
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    test("should support method chaining", () => {
      const entry = new LogEntry("Test")
        .setParameter("key1", "value1")
        .setParameter("key2", "value2")
        .setSeverity(Severity.ERROR)
        .setError(new Error("Test error"));
      
      expect(entry.parameters).toEqual({ key1: "value1", key2: "value2" });
      expect(entry.severity).toBe(Severity.ERROR);
      expect(entry.error).toBeInstanceOf(Error);
    });
  });

  describe("DodgeballLogLevel", () => {
    test("should be an alias for ComposerLogLevel", () => {
      expect(DodgeballLogLevel).toBe(ComposerLogLevel);
      expect(DodgeballLogLevel.TRACE).toBe(ComposerLogLevel.TRACE);
      expect(DodgeballLogLevel.INFO).toBe(ComposerLogLevel.INFO);
      expect(DodgeballLogLevel.ERROR).toBe(ComposerLogLevel.ERROR);
      expect(DodgeballLogLevel.NONE).toBe(ComposerLogLevel.NONE);
    });
  });
});
