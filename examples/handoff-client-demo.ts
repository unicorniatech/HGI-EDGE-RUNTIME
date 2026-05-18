/**
 * HGI Edge Runtime - Handoff Client Demo
 *
 * Demonstrates HGI-LOCAL-HUB client functionality.
 * Tests connectivity and explores capabilities.
 *
 * Usage:
 *   # Default: http://localhost:4010
 *   npm run example:handoff
 *
 *   # Custom hub URL
 *   $env:HGI_LOCAL_HUB_URL="http://my-hub:4010"; npm run example:handoff
 *
 *   # With real handoff submission (requires working hub)
 *   $env:HGI_TEST_SUBMIT_HANDOFF="true"; npm run example:handoff
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { HGIHubError } from '../src/types/hub-handoff.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('HGI-LOCAL-HUB Handoff Client Demo');
  console.log('========================================');
  console.log();

  // Create client from environment or defaults
  const hubUrl = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
  console.log(`Hub URL: ${hubUrl}`);
  console.log();

  const client = createHGIHubClient({
    baseUrl: hubUrl,
    timeoutMs: 10000,
    runtimeId: 'hgi-edge-runtime-demo',
  });

  // Test 1: Check if hub is reachable
  console.log('--- Test 1: Health Check ---');
  try {
    const health = await client.health();
    console.log('✓ Hub is reachable');
    console.log(`  Healthy: ${health.healthy}`);
    console.log(`  Version: ${health.version ?? 'unknown'}`);
    console.log(`  Available Nodes: ${health.availableNodes ?? 'unknown'}`);
    console.log(`  Queue Depth: ${health.queueDepth ?? 'unknown'}`);
    console.log(`  Uptime: ${health.uptimeSeconds ? `${health.uptimeSeconds}s` : 'unknown'}`);
  } catch (error) {
    if (error instanceof HGIHubError && error.type === 'not_found') {
      console.log('⚠ Health endpoint not implemented yet (404)');
      console.log('  HGI-LOCAL-HUB may not support this endpoint');
    } else if (error instanceof HGIHubError && error.type === 'network') {
      console.log('✗ Hub is not reachable');
      console.log(`  Error: ${error.message}`);
      console.log();
      console.log('Make sure HGI-LOCAL-HUB is running on the expected URL.');
      console.log('You can override the URL with HGI_LOCAL_HUB_URL environment variable.');
    } else {
      console.log('✗ Health check failed');
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log();

  // Test 2: Query capabilities
  console.log('--- Test 2: Capabilities Query ---');
  try {
    const capabilities = await client.capabilities();
    console.log('✓ Capabilities query succeeded');
    console.log(`  Hub ID: ${capabilities.hubId}`);
    console.log(`  Available capabilities:`);
    for (const cap of capabilities.capabilities) {
      const status = cap.available ? '✓' : '✗';
      console.log(`    ${status} ${cap.capability} (nodes: ${cap.nodeCount ?? 'N/A'})`);
    }
  } catch (error) {
    if (error instanceof HGIHubError && error.type === 'not_found') {
      console.log('⚠ Capabilities endpoint not implemented yet (404)');
      console.log('  HGI-LOCAL-HUB may not support this endpoint');
    } else {
      console.log('✗ Capabilities query failed');
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log();

  // Test 3: Submit handoff (optional, controlled by environment)
  const testSubmitHandoff = process.env.HGI_TEST_SUBMIT_HANDOFF === 'true';

  if (testSubmitHandoff) {
    console.log('--- Test 3: Submit Handoff (LIVE) ---');
    console.log('Warning: This will submit a real handoff request to the hub');

    const handoffRequest = {
      requestId: `demo-${Date.now()}`,
      sourceRuntimeId: 'hgi-edge-runtime-demo',
      sourceDeviceId: 'demo-device',
      localModel: {
        modelId: 'tinyllama-1.1b',
        modelPath: './models/tinyllama.gguf',
        modelSizeBytes: 637_000_000,
      },
      originalRequest: {
        input: 'Hello, this is a demo handoff request',
        model: 'tinyllama-1.1b',
        parameters: {
          maxTokens: 100,
          temperature: 0.7,
        },
      },
      handoffSignal: {
        type: 'OOM_RISK' as const,
        severity: 'high' as const,
        reason: 'Demo: Memory threshold crossed',
        metrics: {
          timestamp: new Date().toISOString(),
          heapUsed: 1_500_000_000,
          rss: 2_500_000_000,
        },
        suggestedTarget: 'node' as const,
        timestamp: new Date().toISOString(),
        mandatory: false,
        crossedThresholds: ['heapMemory'],
      },
      metrics: {
        timestamp: new Date().toISOString(),
        heapUsed: 1_500_000_000,
        rss: 2_500_000_000,
        inferenceTimeMs: 5000,
        promptTokens: 50,
      },
      requestedCapability: 'llm' as const,
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await client.submitHandoff(handoffRequest);
      console.log('✓ Handoff submitted successfully');
      console.log(`  Accepted: ${response.accepted}`);
      console.log(`  Handoff ID: ${response.handoffId ?? 'N/A'}`);
      console.log(`  Status: ${response.status}`);
      console.log(`  Target Node: ${response.targetNodeId ?? 'Not assigned yet'}`);
      console.log(`  Estimated Wait: ${response.estimatedWaitMs ? `${response.estimatedWaitMs}ms` : 'N/A'}`);

      // If we have a handoff ID, try to query status
      if (response.handoffId) {
        console.log();
        console.log('--- Test 4: Query Handoff Status ---');
        try {
          const status = await client.getHandoffStatus(response.handoffId);
          console.log('✓ Status query succeeded');
          console.log(`  Status: ${status.status}`);
          console.log(`  Result available: ${status.result ? 'yes' : 'no'}`);
        } catch (statusError) {
          if (statusError instanceof HGIHubError && statusError.type === 'not_found') {
            console.log('⚠ Status endpoint not implemented yet (404)');
          } else {
            console.log('✗ Status query failed');
            console.log(`  Error: ${statusError instanceof Error ? statusError.message : String(statusError)}`);
          }
        }
      }
    } catch (error) {
      if (error instanceof HGIHubError && error.type === 'not_found') {
        console.log('⚠ Handoff endpoint not implemented yet (404)');
        console.log('  HGI-LOCAL-HUB may not support this endpoint');
      } else if (error instanceof HGIHubError && error.type === 'unavailable') {
        console.log('⚠ Hub temporarily unavailable');
        console.log(`  Reason: ${error.message}`);
      } else {
        console.log('✗ Handoff submission failed');
        console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    console.log('--- Test 3: Submit Handoff (SKIPPED) ---');
    console.log('Set HGI_TEST_SUBMIT_HANDOFF=true to test handoff submission');
    console.log('Skipped to avoid submitting test data to production hub');
  }
  console.log();

  // Summary
  console.log('========================================');
  console.log('Demo Complete');
  console.log('========================================');
  console.log();
  console.log('Notes:');
  console.log('  • 404 errors are expected if HGI-LOCAL-HUB does not');
  console.log('    implement these endpoints yet');
  console.log('  • This client is forward-looking for future hub versions');
  console.log('  • All endpoints are optional at this stage');
  console.log();
  console.log('Next steps:');
  console.log('  1. Ensure HGI-LOCAL-HUB is running');
  console.log('  2. Implement /health endpoint in HGI-LOCAL-HUB');
  console.log('  3. Implement /capabilities endpoint');
  console.log('  4. Implement /handoff endpoint');
  console.log('  5. Test end-to-end handoff flow');
  console.log();
}

// Run the demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
