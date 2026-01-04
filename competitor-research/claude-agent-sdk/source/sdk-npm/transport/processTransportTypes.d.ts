import type { Readable, Writable } from 'stream';
/**
 * Represents a spawned process with stdin/stdout streams and lifecycle management.
 * Implementers provide this interface to abstract the process spawning mechanism.
 * ChildProcess already satisfies this interface.
 */
export interface SpawnedProcess {
    /** Writable stream for sending data to the process stdin */
    stdin: Writable;
    /** Readable stream for receiving data from the process stdout */
    stdout: Readable;
    /** Whether the process has been killed */
    readonly killed: boolean;
    /** Exit code if the process has exited, null otherwise */
    readonly exitCode: number | null;
    /**
     * Kill the process with the given signal
     * @param signal - The signal to send (e.g., 'SIGTERM', 'SIGKILL')
     */
    kill(signal: NodeJS.Signals): boolean;
    /**
     * Register a callback for when the process exits
     * @param event - Must be 'exit'
     * @param listener - Callback receiving exit code and signal
     */
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    /**
     * Register a callback for process errors
     * @param event - Must be 'error'
     * @param listener - Callback receiving the error
     */
    on(event: 'error', listener: (error: Error) => void): void;
    /**
     * Register a one-time callback for when the process exits
     */
    once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    once(event: 'error', listener: (error: Error) => void): void;
    /**
     * Remove an event listener
     */
    off(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    off(event: 'error', listener: (error: Error) => void): void;
}
/**
 * Options passed to the spawn function.
 */
export interface SpawnOptions {
    /** Command to execute */
    command: string;
    /** Arguments to pass to the command */
    args: string[];
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env: {
        [envVar: string]: string | undefined;
    };
    /** Abort signal for cancellation */
    signal: AbortSignal;
}
