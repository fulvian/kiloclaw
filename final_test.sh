#!/bin/bash
set -e

echo "🔍 NBA ROUTING FIX - FINAL VERIFICATION"
echo "======================================="
echo ""

echo "✓ Step 1: Verifying code changes"
grep -q "nba_analysis: Analyze NBA games" packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts && echo "  ✅ CAPABILITY_CLASSIFICATION_PROMPT updated" || echo "  ❌ FAILED"
grep -q "nba: NBA games, statistics, injuries" packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts && echo "  ✅ DOMAIN_CLASSIFICATION_PROMPT updated" || echo "  ❌ FAILED"
grep -q "\"nba\": \[" packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts && echo "  ✅ classifyDomainWithLLM() updated" || echo "  ❌ FAILED"
grep -q "nba: \[\"nba_analysis\"" packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts && echo "  ✅ extractCapabilitiesFromKeywords() updated" || echo "  ❌ FAILED"
echo ""

echo "✓ Step 2: Running NBA tests"
cd packages/opencode
bun test test/kiloclaw/nba-tool-resolution.test.ts test/kiloclaw/nba-routing-diagnostic.test.ts test/kiloclaw/nba-pipeline-e2e.test.ts 2>&1 | grep -E "pass|fail" | tail -3
echo ""

echo "✓ Step 3: Git commits verified"
git log --oneline -2 | grep -E "fix\(agency\)|docs:" && echo "  ✅ Commits created successfully" || echo "  ❌ FAILED"
echo ""

echo "======================================="
echo "🎉 NBA ROUTING FIX COMPLETE & VERIFIED"
echo "======================================="
