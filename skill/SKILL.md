# adobe-desktop-mcp

Use this MCP server when an agent needs structured discovery of Adobe desktop app coverage and, once bridge milestones land, safe automation of supported Adobe workflows.

## Current State

- Illustrator automation is implemented for macOS.
- The other Adobe hosts currently expose discovery and capability tools only.
- Tooling is intentionally honest about feasibility and app-specific limitations.

## Intended Usage

- Ask `adobe_desktop_get_capability_matrix` to understand which app is a viable target.
- Ask `adobe_desktop_get_app_status` or the app-specific `*_get_status` tool before planning a workflow.
- Prefer Illustrator, Photoshop, and InDesign for early production automation.
- Treat Acrobat as limited and Premiere as deferred until later milestones land.

## Guardrails

- Do not assume every Adobe host supports the same automation mechanism.
- Do not promise silent full-fidelity control of unsupported UI workflows.
- Prefer bounded document operations over arbitrary script injection when real bridges are implemented.
