# HGI Llama.cpp Adapter Feasibility Study

**Date**: 2026-05-18  
**Phase**: 2A - Feasibility Evaluation  
**Target**: Windows x86_64 development environment

---

## Executive Summary

**Recommended Path**: `node-llama-cpp` via npm  
**Fallback Path**: llama.cpp CLI subprocess wrapper  
**Rejected**: Python bindings, Ollama dependency

---

## Option Evaluations

### 1. node-llama-cpp (RECOMMENDED)

| Attribute | Value |
|-----------|-------|
| **Package** | `node-llama-cpp@3.18.1` |
| **License** | MIT |
| **Windows Support** | ✓ Yes (prebuilt binaries available) |
| **GGUF Support** | ✓ Full native support |
| **Streaming** | ✓ Native token streaming |
| **Dependencies** | 28 npm deps, cmake-js for builds |
| **Binary Size** | ~32MB base + model |
| **Repository** | https://github.com/withcatai/node-llama-cpp |

**Pros:**
- Native TypeScript/JavaScript bindings - no FFI complexity
- Prebuilt binaries for Windows x64 (no compilation needed for basic use)
- Active maintenance (135 versions, last published 2 months ago)
- Supports GGUF, JSON schema, function calling, embeddings
- Compatible with IAdapter interface
- Cross-platform (Windows, Linux, macOS, ARM64, CUDA, Vulkan)
- No Python dependency
- No external service required (unlike Ollama)

**Cons:**
- Requires CMake for custom builds (if prebuilt not available)
- 28 npm dependencies (moderate weight)
- Binary download on first install (~30-100MB)

**Risk Level**: LOW

**Suitability for HGI**: EXCELLENT - aligns with local-first, no cloud, TypeScript-native architecture

---

### 2. llama.cpp CLI Subprocess (FALLBACK)

| Attribute | Value |
|-----------|-------|
| **Approach** | Spawn llama.cpp binary as child process |
| **License** | MIT (llama.cpp) |
| **Windows Support** | ✓ Yes (official releases) |
| **GGUF Support** | ✓ Full support |
| **Streaming** | ✓ Via stdout parsing |
| **Dependencies** | None (user provides binary) |
| **Binary Size** | User-managed |

**Pros:**
- Zero npm dependencies for adapter
- User controls llama.cpp version completely
- Works if node-llama-cpp has build issues
- Simple to understand/debug

**Cons:**
- Process spawn overhead
- stdout parsing for streaming is fragile
- No type safety on API boundary
- User must download/manage llama.cpp binary separately

**Risk Level**: MEDIUM (complexity in streaming implementation)

**Suitability for HGI**: GOOD - acceptable fallback, maintains zero cloud dependency

---

### 3. llama-cpp-python via HTTP Bridge (REJECTED)

| Attribute | Value |
|-----------|-------|
| **Approach** | Python server + Node.js HTTP client |
| **License** | MIT |
| **Windows Support** | ✓ Yes |
| **GGUF Support** | ✓ Full support |
| **Streaming** | ✓ Via SSE/WebSocket |

**Pros:**
- llama-cpp-python is mature and well-documented
- Fast iteration possible

**Cons:**
- **Python not installed** on target development environment
- Requires Python environment management (conda/pip)
- HTTP stack adds complexity and failure modes
- Two-process architecture violates "lightweight" principle
- Harder to distribute to end users

**Risk Level**: HIGH (deployment complexity)

**Suitability for HGI**: POOR - violates simplicity, adds Python dependency

**Decision**: REJECTED

---

### 4. Ollama Local API (REJECTED)

| Attribute | Value |
|-----------|-------|
| **Approach** | HTTP client to local Ollama daemon |
| **License** | MIT |
| **Windows Support** | ✓ Yes |
| **GGUF Support** | ✓ Via model conversion |
| **Streaming** | ✓ Via SSE |

**Pros:**
- Very simple HTTP API
- Good model management UX
- Widely used

**Cons:**
- **Ollama not installed** on target environment
- Requires separate Ollama installation
- Ollama runs as background service (resource usage)
- Less control over inference parameters
- Adds external dependency outside npm
- Ollama's model format is different (requires conversion)

**Risk Level**: MEDIUM (external dependency)

**Suitability for HGI**: FAIR - convenient but violates "adapter independence" and adds service dependency

**Decision**: REJECTED for core adapter, may support as community option later

---

### 5. mistral.rs (FUTURE CONSIDERATION)

| Attribute | Value |
|-----------|-------|
| **Approach** | Rust-based inference backend |
| **License** | MIT |
| **Windows Support** | ✓ Yes |
| **GGUF Support** | ✓ Via mistral.rs's own format |
| **Streaming** | ✓ Yes |

**Pros:**
- Rust performance
- Memory safety
- Modern architecture
- Good for specific model families

**Cons:**
- Different ecosystem than llama.cpp
- Smaller community than llama.cpp
- Would be additional adapter, not replacement

**Risk Level**: LOW (as secondary adapter)

**Suitability for HGI**: GOOD - as future additional adapter option

**Decision**: DEFER to Phase 4+ (not primary llama.cpp path)

---

## Comparison Matrix

| Criterion | node-llama-cpp | CLI Subprocess | Python Bridge | Ollama |
|-----------|---------------|----------------|---------------|--------|
| Windows Support | ✓ | ✓ | ✓ | ✓ |
| Install Complexity | Low | Medium | High | Medium |
| GGUF Native | ✓ | ✓ | ✓ | ~ |
| Streaming | ✓ | ~ | ✓ | ✓ |
| Zero Cloud | ✓ | ✓ | ✓ | ✓ |
| No Extra Services | ✓ | ✓ | ✓ | ✗ |
| TypeScript Native | ✓ | ~ | ✗ | ✗ |
| Future Linux/ARM | ✓ | ✓ | ✓ | ✓ |
| IAdapter Compatible | ✓ | ✓ | ~ | ~ |

**Legend**: ✓ Yes/Good | ~ Partial | ✗ No/Bad

---

## Recommended Implementation Plan

### Phase 2B: Minimal node-llama-cpp Integration

1. **Install dependency**:
   ```bash
   npm install node-llama-cpp
   ```

2. **Download test model** (smallest viable):
   - **Recommendation**: `TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf`
   - Size: ~600MB
   - Purpose: Basic functionality testing
   - Source: Hugging Face (TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)

3. **Implement minimal adapter**:
   - File: `adapters/llama_cpp/adapter.ts`
   - Implement `IAdapter` interface
   - Support `load()`, `infer()`, basic `inferStream()`
   - No advanced features (grammar, embeddings) in Phase 2B

4. **Validation**:
   - Load model successfully
   - Generate coherent text
   - Stream tokens

### Expected Commands for Phase 2B

```bash
# Install
npm install node-llama-cpp

# Build
npm run build

# Test (after model download)
npm test
# Should run: adapters/llama_cpp/adapter.test.ts
```

### Phase 2C: Full Adapter (Future)

- Full streaming support with TokenCallback
- Memory usage reporting
- GPU (CUDA) support detection
- Model quantization detection
- Error handling for handoff conditions (OOM, timeout)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| node-llama-cpp build fails | Fallback to CLI subprocess adapter |
| Model too large for testing | Use TinyLlama (600MB) not 7B models |
| Binary download blocked | Document manual binary placement |
| Windows-specific issues | Test on Linux in Phase 3 |

---

## Files Modified/Created

- `docs/HGI_LLAMA_CPP_ADAPTER_FEASIBILITY.md` (this file)
- `adapters/llama_cpp/TODO.md` (updated with implementation plan)

---

## Next Steps

**Proceed to Phase 2B** when ready:
- Run `npm install node-llama-cpp`
- Download TinyLlama test model
- Implement `adapters/llama_cpp/adapter.ts`
- Create adapter-specific tests

**Decision Authority**: Ready for Phase 2B implementation

---

**Document Version**: 0.1.0  
**Status**: Feasibility Complete - Ready for Implementation
