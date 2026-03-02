export const expand = (parent: string) => ({
  parent,
  description: "Expand Phase 1-3 metaflows into implementation batches",
  children: [
    // Phase 1: Workflow Hints
    {
      id: "design-hints-rendering",
      description: "Design hint rendering strategy, placement, format",
      children: ["design-hints-doc", "prototype-hints"]
    },
    {
      id: "implement-orient-next-step",
      description: "Implement Next Step block in orient output",
      children: ["add-next-step-block", "add-examples", "test-hint-visibility"]
    },
    {
      id: "detect-reorient-pattern",
      description: "Detect re-orient pattern and offer redirect",
      children: ["instrument-timing", "detect-pattern-logic", "suggest-redirect"]
    },
    {
      id: "test-workflow-hints",
      description: "Test hint effectiveness and A/B variants",
      children: ["unit-test-hints", "integration-test-hints", "abtest-verbose-minimal"]
    },
    {
      id: "mining-abandon-rate",
      description: "Mine 50+ workflows, measure abandon rate < 60%",
      children: ["run-mining-50x", "classify-abandon", "compute-rate", "validate-gate"]
    },
    
    // Phase 1: Error Recovery
    {
      id: "design-error-classifier",
      description: "Design error classification (permission|args|logic|system)",
      children: ["classify-errors-doc", "map-commands-to-errors"]
    },
    {
      id: "implement-error-recovery",
      description: "Add recovery hints to claim/orient/validate/complete",
      children: [
        "impl-claim-hints",
        "impl-orient-hints",
        "impl-validate-hints",
        "impl-complete-hints"
      ]
    },
    {
      id: "test-error-recovery",
      description: "Test error classification and recovery hints",
      children: ["test-error-classify", "test-recovery-hints", "unit-tests-all-commands"]
    },
    {
      id: "mining-error-recovery",
      description: "Mine 50 error scenarios, measure retry rate >= 80%",
      children: ["trigger-50-errors", "log-retries", "compute-retry-rate", "validate-gate"]
    },
    
    // Phase 1: Parallel Features
    {
      id: "update-help-assign-next-ready",
      description: "Update help text with swarm dispatch examples",
      children: ["add-assign-example", "add-next-example", "add-ready-example"]
    },
    {
      id: "implement-help-examples",
      description: "Implement help examples in bin/roadmap.ts",
      children: ["impl-help-assign", "impl-help-next", "impl-help-ready"]
    },
    {
      id: "test-swarm-dispatch",
      description: "Test 3-agent swarm with --assign, --next, --ready",
      children: ["test-assign-claims", "test-pregate-context", "test-ready-state"]
    },
    {
      id: "mining-parallel-adoption",
      description: "Mine 20+ swarms, measure --assign adoption >= 20%",
      children: ["run-20-swarms", "measure-assign-usage", "compute-adoption", "validate-gate"]
    }
  ]
});
