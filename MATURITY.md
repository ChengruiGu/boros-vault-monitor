# Vault Maturity/Expiration

## Overview

Yes, vaults (AMMs) **do expire**. Each vault is tied to a Market contract, and both share the same maturity date. Once a vault reaches its maturity date, it is considered expired and should not be monitored for new deposits.

## How Maturity Works

### Contract Structure

1. **AMM Contract** (`BaseAMM.sol`):
   - Has `MATURITY()` - immutable uint32 timestamp when the vault expires
   - Has `MARKET()` - address of the associated Market contract

2. **Market Contract**:
   - Has `descriptor()` which returns `(..., uint32 maturity, ..., uint32 latestFTime)`
   - Has `getLatestFTime()` - returns the current floating time index
   - **Maturity Check**: `latestFTime >= maturity` means the market/vault is expired

### Expiration Logic

A vault is considered **expired** when:
```solidity
latestFTime >= maturity
```

Where:
- `maturity`: The expiration timestamp (set when market/vault is created)
- `latestFTime`: The current floating time index (updated periodically by the FIndex Oracle)

## Where to Find Maturity in Contracts

### For AMM/Vault:
- **Function**: `MATURITY()` - public view function
- **Location**: `BaseAMM.sol` line 25
- **Returns**: `uint32` - Unix timestamp

### For Market:
- **Function**: `descriptor()` - returns tuple including maturity
- **Function**: `getLatestFTime()` - returns current floating time
- **Location**: `IMarket.sol` interface

### Maturity Check Implementation:
- **Location**: `MarketInfoAndState.sol` line 70-72
```solidity
function _isMatured(MarketMem memory market) internal pure returns (bool) {
    return market.latestFTime >= market.k_maturity;
}
```

## Bot Implementation

The bot now:
1. ✅ Tracks `maturity` and `marketAddress` for each vault
2. ✅ Checks expiration before sending notifications
3. ✅ Skips expired vaults in monitoring loops
4. ✅ Only notifies about **live (non-expired)** vaults

### Expiration Check Flow

```typescript
// Get maturity from AMM
const maturity = await ammContract.MATURITY();

// Get market address from AMM
const marketAddress = await ammContract.MARKET();

// Get latest floating time from Market
const marketContract = new ethers.Contract(marketAddress, MarketABI, provider);
const latestFTime = await marketContract.getLatestFTime();

// Check if expired
const isExpired = latestFTime >= maturity;
```

## Why This Matters

- **Expired vaults** cannot accept new deposits
- Monitoring expired vaults wastes resources
- Users only care about **live vaults** with available capacity
- Cap raises on expired vaults are irrelevant

The bot now automatically filters out expired vaults and only monitors active ones! 🎯

