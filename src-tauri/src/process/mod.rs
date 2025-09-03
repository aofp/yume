/// Process management module for Claude CLI processes
/// Provides centralized tracking and management of all spawned processes
/// Ensures proper cleanup and prevents orphaned processes

pub mod registry;

pub use registry::{
    ProcessRegistry,
    ProcessType,
};