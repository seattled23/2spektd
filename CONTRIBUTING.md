# Contributing to spec2

Thank you for your interest in contributing to spec2!

---

## Getting Started

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/seattled23/spec2.git`
3. **Create a branch**: `git checkout -b feature/your-feature-name`
4. **Make your changes**
5. **Test your changes** (see below)
6. **Commit**: `git commit -m "feat: your feature description"`
7. **Push**: `git push origin feature/your-feature-name`
8. **Create a Pull Request**

---

## Development Setup

```bash
# Install Python dependencies
pip install -e ".[dev]"

# Install validation tools (all languages)
bash validation/modules/go/install-tools.sh
bash validation/modules/typescript/install-tools.sh
bash validation/modules/python/install-tools.sh
bash validation/modules/shell/install-tools.sh

# Run tests
pytest

# Format code
black .
ruff check --fix .

# Type check
mypy mcp-server/
```

---

## Testing Changes

### Test MCP Server
```bash
# Run server
python mcp-server/server.py

# Test with Claude Code
# Add to ~/.claude.json:
{
  "mcpServers": {
    "spec2": {
      "command": "python",
      "args": ["/path/to/spec2/mcp-server/server.py"]
    }
  }
}
```

### Test Validation Modules
```bash
# Test on sample component
bash validation/validate-component.sh validation/modules/go go

# Expected: Layer failures (used for testing)
```

### Test Skills
```bash
# Symlink skills
ln -s $(pwd)/skills/spec2-new ~/.claude/skills/
ln -s $(pwd)/skills/spec2-upgrade ~/.claude/skills/

# Test in Claude Code
/spec2:upgrade validation/modules/go go
```

---

## Contribution Types

### 🐛 Bug Fixes
- Include reproduction steps
- Add test case if possible
- Reference issue number

### ✨ New Features
- Discuss in issue first
- Update documentation
- Add tests
- Update CHANGELOG.md

### 📚 Documentation
- Fix typos/clarify existing docs
- Add examples
- Improve README

### 🌐 New Language Support
To add a new language module:

1. Create `validation/modules/{language}/`
2. Implement 12 layer scripts (or adapted subset)
3. Create `README.md` with tool requirements
4. Create `install-tools.sh`
5. Update main README.md
6. Add to MCP server `language_map`

**Template**: Use `validation/modules/go/` as reference

### 🔧 Validation Layer Improvements
- New hollow pattern detections
- Better error messages
- Performance optimizations
- False positive reductions

---

## Code Style

### Python
- **Black** for formatting (100 char line length)
- **Ruff** for linting
- **Type hints** required (mypy strict mode)
- **Docstrings** for all public functions

### Shell Scripts
- **shellcheck** compliant
- `set -e` at top
- Clear error messages
- Comments for complex logic

### Documentation
- **Markdown** for all docs
- Code examples tested
- Clear headings structure

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `chore`: Build/tooling changes

**Examples**:
```
feat(typescript): add layer 11 for dependency analysis
fix(go): reduce hollow scanner false positives
docs(readme): add troubleshooting section
```

---

## Pull Request Process

1. **Update documentation** if behavior changes
2. **Add tests** for new features
3. **Ensure all tests pass**
4. **Update CHANGELOG.md** under "Unreleased"
5. **Request review** from maintainers
6. **Address feedback** promptly

### PR Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] All checks passing
- [ ] Branch up to date with main

---

## Reporting Issues

### Bug Reports
Include:
- Operating system
- Python version
- Language(s) affected
- Minimal reproduction case
- Expected vs actual behavior
- Error messages/stack traces

### Feature Requests
Include:
- Use case description
- Proposed solution
- Alternatives considered
- Willingness to implement

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

---

## License

By contributing, you agree your contributions will be licensed under the MIT License.

---

## Questions?

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and ideas

Thank you for contributing! 🎉
