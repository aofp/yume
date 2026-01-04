import type { StdoutMessage } from '../entrypoints/sdkControlTypes.js';
/**
 * Transport interface for Claude Code SDK communication
 * Abstracts the communication layer to support both process and WebSocket transports
 */
export interface Transport {
    /**
     * Write data to the transport
     * May be async for network-based transports
     */
    write(data: string): void | Promise<void>;
    /**
     * Close the transport connection and clean up resources
     * This also closes stdin if still open (eliminating need for endInput)
     */
    close(): void;
    /**
     * Check if transport is ready for communication
     */
    isReady(): boolean;
    /**
     * Read and parse messages from the transport
     * Each transport handles its own protocol and error checking
     */
    readMessages(): AsyncGenerator<StdoutMessage, void, unknown>;
    /**
     * End the input stream
     */
    endInput(): void;
}
