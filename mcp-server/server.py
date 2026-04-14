#!/usr/bin/env python3
"""
spec2 LEGACY MCP Server — 12-Layer Validation Framework (v1.0 path)

WARNING: LEGACY. This exposes the v1.0 12-layer validator
(`validation/validate-component.sh`). It coexists with the v1.2 TS MCP
server at `skills/spec2-mcp/` (which drives the 6-wave pipeline used by
/spec2-new). The two servers use disjoint tool namespaces:

   * This server  : validate_component, detect_language, install_tools, ...
   * spec2-mcp    : spec2_build, spec2_resume, spec2_status, spec2_jobs,
                    spec2_logs, spec2_check_tests

Future deprecation is tracked in ROADMAP §4. Until then, both are supported.

Provides tools for deterministic 12-layer code validation with anti-reward-hacking.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

# Add MCP SDK to path (adjust if needed)
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("ERROR: MCP SDK not found. Install with: pip install mcp", file=sys.stderr)
    sys.exit(1)

# Initialize server
app = Server("2spektd")

# Find validation root
VALIDATION_ROOT = Path(__file__).parent.parent / "validation"

@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available 2spektd validation tools."""
    return [
        Tool(
            name="validate_component",
            description="Run 12-layer validation on a component",
            inputSchema={
                "type": "object",
                "properties": {
                    "component_path": {
                        "type": "string",
                        "description": "Path to component (e.g., pkg/analytics)"
                    },
                    "language": {
                        "type": "string",
                        "enum": ["go", "typescript", "python", "shell"],
                        "description": "Programming language"
                    }
                },
                "required": ["component_path", "language"]
            }
        ),
        Tool(
            name="detect_language",
            description="Auto-detect programming language from file extensions",
            inputSchema={
                "type": "object",
                "properties": {
                    "component_path": {
                        "type": "string",
                        "description": "Path to component"
                    }
                },
                "required": ["component_path"]
            }
        ),
        Tool(
            name="install_validation_tools",
            description="Install validation tools for a language",
            inputSchema={
                "type": "object",
                "properties": {
                    "language": {
                        "type": "string",
                        "enum": ["go", "typescript", "python", "shell", "all"],
                        "description": "Language to install tools for"
                    }
                },
                "required": ["language"]
            }
        ),
        Tool(
            name="get_validation_status",
            description="Check if validation tools are installed",
            inputSchema={
                "type": "object",
                "properties": {
                    "language": {
                        "type": "string",
                        "enum": ["go", "typescript", "python", "shell"],
                        "description": "Language to check"
                    }
                },
                "required": ["language"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    """Handle tool calls."""

    if name == "validate_component":
        return await validate_component(
            arguments["component_path"],
            arguments["language"]
        )

    elif name == "detect_language":
        return await detect_language(arguments["component_path"])

    elif name == "install_validation_tools":
        return await install_validation_tools(arguments["language"])

    elif name == "get_validation_status":
        return await get_validation_status(arguments["language"])

    else:
        return [TextContent(type="text", text=f"Unknown tool: {name}")]

async def validate_component(component_path: str, language: str) -> list[TextContent]:
    """Run 12-layer validation on component."""

    validator_script = VALIDATION_ROOT / "validate-component.sh"

    if not validator_script.exists():
        return [TextContent(
            type="text",
            text=f"ERROR: Validator script not found at {validator_script}"
        )]

    # Run validation
    proc = await asyncio.create_subprocess_exec(
        "bash",
        str(validator_script),
        component_path,
        language,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(VALIDATION_ROOT.parent)
    )

    stdout, stderr = await proc.communicate()

    output = stdout.decode() if stdout else ""
    errors = stderr.decode() if stderr else ""

    # Parse result
    result = {
        "component": component_path,
        "language": language,
        "exit_code": proc.returncode,
        "status": "PASS" if proc.returncode == 0 else "FAIL",
        "output": output,
        "errors": errors
    }

    if proc.returncode == 0:
        message = f"✅ ALL LAYERS PASSED\n\nComponent: {component_path}\nLanguage: {language}\n\n{output}"
    else:
        failed_layer = get_failed_layer(proc.returncode)
        message = f"❌ VALIDATION FAILED\n\nComponent: {component_path}\nLanguage: {language}\nFailed at: {failed_layer}\nExit code: {proc.returncode}\n\n{output}\n\n{errors}"

    return [TextContent(type="text", text=message)]

async def detect_language(component_path: str) -> list[TextContent]:
    """Auto-detect language from file extensions."""

    path = Path(component_path)

    if not path.exists():
        return [TextContent(
            type="text",
            text=f"ERROR: Path not found: {component_path}"
        )]

    # Count file extensions
    extensions = {}
    for file in path.rglob("*"):
        if file.is_file():
            ext = file.suffix.lower()
            extensions[ext] = extensions.get(ext, 0) + 1

    # Map extensions to languages
    language_map = {
        ".go": "go",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "typescript",  # Assume TypeScript for JS too
        ".jsx": "typescript",
        ".py": "python",
        ".sh": "shell",
        ".bash": "shell"
    }

    # Find dominant language
    language_counts = {}
    for ext, count in extensions.items():
        if ext in language_map:
            lang = language_map[ext]
            language_counts[lang] = language_counts.get(lang, 0) + count

    if not language_counts:
        return [TextContent(
            type="text",
            text="ERROR: Could not detect language (no recognized files found)"
        )]

    detected_lang = max(language_counts, key=language_counts.get)
    file_count = language_counts[detected_lang]

    return [TextContent(
        type="text",
        text=f"Detected language: {detected_lang}\nFiles found: {file_count}\n\nBreakdown:\n" +
             "\n".join(f"  {lang}: {count} files" for lang, count in sorted(language_counts.items()))
    )]

async def install_validation_tools(language: str) -> list[TextContent]:
    """Install validation tools for a language."""

    if language == "all":
        languages = ["go", "typescript", "python", "shell"]
    else:
        languages = [language]

    results = []

    for lang in languages:
        install_script = VALIDATION_ROOT / "modules" / lang / "install-tools.sh"

        if not install_script.exists():
            results.append(f"❌ {lang}: Install script not found")
            continue

        proc = await asyncio.create_subprocess_exec(
            "bash",
            str(install_script),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode == 0:
            results.append(f"✅ {lang}: Tools installed successfully")
        else:
            results.append(f"❌ {lang}: Installation failed\n{stderr.decode()}")

    return [TextContent(type="text", text="\n".join(results))]

async def get_validation_status(language: str) -> list[TextContent]:
    """Check if validation tools are installed."""

    # Tool check commands
    tool_checks = {
        "go": [
            ("golangci-lint", ["golangci-lint", "--version"]),
            ("gosec", ["gosec", "--version"]),
            ("govulncheck", ["govulncheck", "-version"]),
            ("gocyclo", ["gocyclo", "--version"]),
            ("staticcheck", ["staticcheck", "-version"])
        ],
        "typescript": [
            ("tsc", ["tsc", "--version"]),
            ("eslint", ["eslint", "--version"]),
            ("vitest", ["vitest", "--version"]),
            ("complexity-report", ["cr", "--version"])
        ],
        "python": [
            ("pyright", ["pyright", "--version"]),
            ("pytest", ["pytest", "--version"]),
            ("bandit", ["bandit", "--version"]),
            ("safety", ["safety", "--version"]),
            ("radon", ["radon", "--version"])
        ],
        "shell": [
            ("shellcheck", ["shellcheck", "--version"]),
            ("shfmt", ["shfmt", "--version"]),
            ("bats", ["bats", "--version"])
        ]
    }

    if language not in tool_checks:
        return [TextContent(
            type="text",
            text=f"ERROR: Unknown language: {language}"
        )]

    results = []
    all_installed = True

    for tool_name, cmd in tool_checks[language]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()

            if proc.returncode == 0:
                results.append(f"✅ {tool_name}")
            else:
                results.append(f"❌ {tool_name} (not working)")
                all_installed = False
        except FileNotFoundError:
            results.append(f"❌ {tool_name} (not installed)")
            all_installed = False

    status = "All tools installed" if all_installed else "Some tools missing"

    return [TextContent(
        type="text",
        text=f"Validation Tools Status ({language}):\n{status}\n\n" + "\n".join(results)
    )]

def get_failed_layer(exit_code: int) -> str:
    """Map exit code to failed layer."""
    layers = {
        11: "Layer -1 (Self-Validation)",
        10: "Layer 0 (Static Analysis)",
        21: "Layer 1 (Contract Annotations)",
        22: "Layer 2 (Tests + Coverage)",
        23: "Layer 3 (Anti-Hollow Patterns)",
        24: "Layer 4 (Security Audit)",
        25: "Layer 5 (Architecture Scores)",
        26: "Layer 6 (Convergence)",
        27: "Layer 7 (Correspondence Matrix)",
        28: "Layer 8 (Completeness Manifest)",
        29: "Layer 9 (Artifact Chain)",
        30: "Layer 10 (Determinism)"
    }

    return layers.get(exit_code, f"Unknown Layer (exit {exit_code})")

async def main():
    """Run MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )

if __name__ == "__main__":
    asyncio.run(main())
