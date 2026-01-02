import { VaultMonitor } from './vaultMonitor';
import { CONFIG } from './config';

async function main() {
  console.log('Boros Vault Monitor Bot');
  console.log('=======================');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`AMM Factory: ${CONFIG.AMM_FACTORY_ADDRESS}`);
  console.log(`RPC URL: ${CONFIG.RPC_URL}`);
  console.log('');

  const monitor = new VaultMonitor();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    monitor.stop();
    process.exit(0);
  });

  // Start monitoring
  await monitor.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

