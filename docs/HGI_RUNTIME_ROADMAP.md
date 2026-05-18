# HGI Runtime Roadmap

## Phase 1: Foundation (Current)

**Goal**: Establish runtime architecture and interfaces

**Deliverables**:
- [x] Repository structure
- [x] Architecture documentation
- [x] Typed adapter interfaces
- [x] Placeholder adapter folders
- [x] Runtime lifecycle draft
- [x] Principles documentation
- [x] Minimal tooling setup

**Completion Criteria**:
- Clean architecture defined
- TypeScript project compiles
- No actual inference yet

---

## Phase 2: Llama.cpp Prototype

**Goal**: First working inference via llama.cpp adapter

**Deliverables**:
- [ ] llama.cpp adapter implementation
- [ ] Model loading (GGUF format)
- [ ] Basic `infer()` implementation
- [ ] Simple test script

**Dependencies**:
- llama.cpp binaries or bindings
- Test GGUF model

**Completion Criteria**:
- Can load and run a GGUF model
- Returns coherent text output

---

## Phase 3: Local Handoff

**Goal**: Define and implement handoff signaling

**Deliverables**:
- [ ] Handoff signal types
- [ ] OOM detection
- [ ] Timeout handling
- [ ] Handoff event system

**Completion Criteria**:
- Runtime can signal when to escalate
- Application receives clear handoff events

---

## Phase 4: STT/VAD (Experimental)

**Goal**: Speech-to-text and voice activity detection adapters

**Deliverables**:
- [ ] Whisper adapter (optional)
- [ ] VAD adapter (Silero/WebRTC)
- [ ] Audio input handling

**Note**: This phase is exploratory. May defer if scope creeps.

---

## Phase 5: Embeddings

**Goal**: Text embedding generation support

**Deliverables**:
- [ ] Embedding adapter interface
- [ ] Sentence-transformers style support
- [ ] Vector caching layer

---

## Phase 6: RAG Foundation

**Goal**: Local retrieval-augmented generation

**Deliverables**:
- [ ] Local vector store (SQLite-based)
- [ ] Document ingestion pipeline
- [ ] RAG query orchestration

**Note**: Keep minimal. No external vector DBs.

---

## Phase 7: EVA Mini Integration

**Goal**: Runtime integration with EVA Mini

**Deliverables**:
- [ ] EVA Mini can import runtime
- [ ] Conversation state management
- [ ] Persona-aware inference

---

## Phase 8: MOLIE Mini Integration

**Goal**: Runtime integration with MOLIE Mini

**Deliverables**:
- [ ] MOLIE Mini can import runtime
- [ ] Multi-model orchestration
- [ ] Context window management

---

## Phase 9: Mobile Runtime

**Goal**: iOS/Android compatible runtime

**Deliverables**:
- [ ] React Native / Native modules
- [ ] CoreML adapter priority
- [ ] Mobile-optimized quantization
- [ ] Battery-aware scheduling

---

## Phase 10: ARM Nodes

**Goal**: Raspberry Pi and ARM edge device support

**Deliverables**:
- [ ] ARM64 builds
- [ ] Metal/NEON optimizations
- [ ] Pi-specific memory management

---

## Phase 11: Distributed Inference (Future)

**Goal**: Multi-device inference coordination

**Deliverables**:
- [ ] Device discovery (local network)
- [ ] Workload partitioning
- [ ] Result aggregation

**Note**: This is aspirational. Only after all above phases complete.

---

## Principles Throughout

1. **No cloud creep**: Each phase must strengthen local-first capability
2. **Adapter discipline**: New features must fit adapter interface
3. **Minimal dependencies**: Prefer native solutions
4. **Test coverage**: Each phase needs tests before next
5. **Documentation**: Update docs with each phase

---

**Document Version**: 0.1.0  
**Last Updated**: 2026-05-18  
**Status**: Living Document
