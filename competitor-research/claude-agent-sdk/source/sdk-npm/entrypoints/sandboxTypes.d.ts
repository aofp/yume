/**
 * Sandbox types for the Claude Code Agent SDK
 *
 * This file is the single source of truth for sandbox configuration types.
 * Both the SDK and the settings validation import from here.
 */
import { z } from 'zod';
/**
 * Network configuration schema for sandbox.
 */
export declare const SandboxNetworkConfigSchema: z.ZodOptional<z.ZodObject<{
    allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
    allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
    httpProxyPort: z.ZodOptional<z.ZodNumber>;
    socksProxyPort: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    allowedDomains?: string[];
    allowUnixSockets?: string[];
    allowAllUnixSockets?: boolean;
    allowLocalBinding?: boolean;
    httpProxyPort?: number;
    socksProxyPort?: number;
}, {
    allowedDomains?: string[];
    allowUnixSockets?: string[];
    allowAllUnixSockets?: boolean;
    allowLocalBinding?: boolean;
    httpProxyPort?: number;
    socksProxyPort?: number;
}>>;
/**
 * Sandbox settings schema.
 */
export declare const SandboxSettingsSchema: z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    autoAllowBashIfSandboxed: z.ZodOptional<z.ZodBoolean>;
    allowUnsandboxedCommands: z.ZodOptional<z.ZodBoolean>;
    network: z.ZodOptional<z.ZodObject<{
        allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    excludedCommands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        command?: string;
        args?: string[];
    }, {
        command?: string;
        args?: string[];
    }>>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    autoAllowBashIfSandboxed: z.ZodOptional<z.ZodBoolean>;
    allowUnsandboxedCommands: z.ZodOptional<z.ZodBoolean>;
    network: z.ZodOptional<z.ZodObject<{
        allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    excludedCommands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        command?: string;
        args?: string[];
    }, {
        command?: string;
        args?: string[];
    }>>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    autoAllowBashIfSandboxed: z.ZodOptional<z.ZodBoolean>;
    allowUnsandboxedCommands: z.ZodOptional<z.ZodBoolean>;
    network: z.ZodOptional<z.ZodObject<{
        allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }, {
        allowedDomains?: string[];
        allowUnixSockets?: string[];
        allowAllUnixSockets?: boolean;
        allowLocalBinding?: boolean;
        httpProxyPort?: number;
        socksProxyPort?: number;
    }>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    excludedCommands: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        command?: string;
        args?: string[];
    }, {
        command?: string;
        args?: string[];
    }>>;
}, z.ZodTypeAny, "passthrough">>;
export type SandboxSettings = z.infer<typeof SandboxSettingsSchema>;
export type SandboxNetworkConfig = NonNullable<z.infer<typeof SandboxNetworkConfigSchema>>;
export type SandboxIgnoreViolations = NonNullable<SandboxSettings['ignoreViolations']>;
