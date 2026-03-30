# Architecture

## Top-Level Shape

The system is a single local MCP server process with:

- a shared MCP core
- a registry of app adapters
- per-app tool modules
- optional companion plugins for hosts where direct external automation is not the best production path

## Why a Single Server

Agents want one stable MCP endpoint. The unified server can expose a coherent tool catalog, shared logging, shared temp file handling, and cross-app capability discovery.

## Why Not a Single Bridge

Adobe desktop apps are not uniform:

- Illustrator, After Effects, and Acrobat still have strong legacy external automation stories
- Photoshop is split between legacy scripting and modern UXP
- InDesign and Premiere are better treated as plugin-bridge integrations for durable modern control

## Current Implementation Boundary

This repository currently implements:

- the MCP transport
- strict schemas and config
- capability descriptors
- host discovery probes
- per-app tool registration
- a real macOS Illustrator bridge using AppleScript to invoke ExtendScript wrappers and structured temp-file results

The other app bridges remain the next milestones.
