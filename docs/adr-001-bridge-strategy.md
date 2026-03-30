# ADR-001: Hybrid Bridge Strategy

## Status

Accepted

## Context

The product target is one MCP server supporting multiple Adobe desktop applications on macOS and Windows.

The research established that Adobe hosts do not share a single durable extensibility mechanism.

## Decision

Use one MCP server and multiple bridge types:

- external-script bridges for hosts with strong documented legacy automation
- companion UXP plugins where modern host APIs and structured bidirectional exchange are required
- app-specific adapters rather than a fake universal Adobe DOM

## Consequences

- The server core stays stable while adapters evolve independently.
- Packaging and installation become more complex for plugin-backed apps.
- V1 scope must be selective and honest.
