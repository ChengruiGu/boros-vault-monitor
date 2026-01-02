# Query Events Script

A simple script to learn how to query events from Ethereum/Arbitrum contracts.

## Usage

```bash
# Make sure you're in the vault-monitor directory
cd vault-monitor

# Run the script
npx ts-node scripts/query-events.ts
```

## What it does

1. **Connects to Arbitrum** via RPC
2. **Gets current block number**
3. **Queries AMMCreated events** from the AMM Factory contract
4. **Shows 3 different methods** to query events:
   - Method 1: Query all events
   - Method 2: Query with filters
   - Method 3: Get events from a transaction receipt

## Configuration

The script uses environment variables from `.env`:
- `RPC_URL` - RPC endpoint (default: public Arbitrum RPC)
- `AMM_FACTORY_ADDRESS` - Contract to query (default: Boros AMM Factory)

## Customization

You can modify the script to:
- Query different events (change the ABI)
- Query different contracts (change the address)
- Adjust block range (change `fromBlock` and `toBlock`)
- Add more filters

## Example Output

```
🔗 Connected to: https://arb1.arbitrum.io/rpc
📦 Current block: 416354146
📄 Contract address: 0x3205e972714B52512c837AE6f5FCFDeB07f0f23C

📊 Method 1: Query all AMMCreated events
==================================================
Scanning blocks 416353146 to 416354146...
✅ Query completed in 1234ms
📋 Found 5 events

Event 1:
  Block: 416353200
  Transaction: 0xabc123...
  AMM Address: 0xdef456...
  Is Positive: true
```

## Tips

- **Start with small block ranges** to test (e.g., last 100 blocks)
- **Use private RPC** (Infura/Alchemy) for better rate limits
- **Check event signatures** match the contract ABI
- **Handle errors** - RPC calls can fail or timeout

