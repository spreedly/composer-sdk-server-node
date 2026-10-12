import { vi } from "vitest";
import { Logger, Severity } from "../src/logger";

// Set logger to NONE level globally to suppress all logger output during tests
Logger.filterLevel = Severity.NONE;

// Also mock console.log as a backup
vi.spyOn(console, 'log').mockImplementation(() => {});

