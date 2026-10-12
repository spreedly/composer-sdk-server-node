export enum ComposerLogLevel {
  TRACE = "TRACE",
  INFO = "INFO",
  ERROR = "ERROR",
  NONE = "NONE",
}

export const DodgeballLogLevel = ComposerLogLevel;

export enum Severity {
  TRACE = 0,
  INFO = 1,
  ERROR = 2,
  NONE = 3,
}

export type LogEntryParameters = { [key: string]: any };

export interface ILogEntry {
  severity: Severity;
  message: string;
  error?: any;
  parameters?: LogEntryParameters;
  date: Date;
}

export class LogEntry implements ILogEntry {
  severity: Severity = Severity.INFO;
  message: string = "";
  error?: any;
  parameters?: { [key: string]: any };
  date = new Date();

  constructor(
    message: string,
    severity: Severity = Severity.INFO,
    error: any = null
  ) {
    this.message = message;
    this.severity = severity;
    this.error = error;
  }

  public setParameters(parameters?: LogEntryParameters) {
    this.parameters = parameters;
    return this;
  }

  public setParameter(key: string, value: any) {
    this.parameters = this.parameters ?? {};
    this.parameters[key] = value;
    return this;
  }

  public setSeverity(severity: Severity) {
    this.severity = severity;
    return this;
  }

  public setError(error?: any) {
    this.error = error;
    return this;
  }

  public log() {
    return Logger.log(this);
  }
}

export class Logger {
  static filterLevel: Severity = Severity.INFO;

  // Callers check this before assembling an expensive trace message, because the
  // message is built before log() gets a chance to discard it
  public static isTraceEnabled() {
    return Severity.TRACE.valueOf() >= Logger.filterLevel.valueOf();
  }

  public static info(message: string, parameters?: LogEntryParameters) {
    return new LogEntry(message, Severity.INFO).setParameters(parameters);
  }

  public static trace(message: string, parameters?: LogEntryParameters) {
    return new LogEntry(message, Severity.TRACE).setParameters(parameters);
  }

  public static error(message: string, error?: any) {
    return new LogEntry(message, Severity.ERROR).setError(error);
  }

  public static formatError(error: any) {
    if (!error) {
      return "";
    }

    if (error instanceof Error) {
      let transformed = error as Error;
      return `
            message: ${transformed.message}
            stack: ${transformed.stack}
            name: ${transformed.name}`;
    } else {
      return error.toString();
    }
  }

  public static log(logEvent: ILogEntry) {
    if (logEvent.severity.valueOf() >= Logger.filterLevel.valueOf()) {
      let logResults =
        `
            Severity: ${Severity[logEvent.severity]}
            Date: ${logEvent.date}
            Message: ${logEvent.message}
            ` + this.formatError(logEvent.error);

      if (logEvent.parameters) {
        logResults = `${logResults}
                parameters: ${logEvent.parameters}`;
      }

      console.log(logResults);
    }
  }
}
