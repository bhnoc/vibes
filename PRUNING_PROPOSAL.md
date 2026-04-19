# Pruning System Refactor Proposal

## Current Problems
1. `removeInactiveElements()` never called - expired elements stay forever
2. `limitNetworkSize()` uses hardcoded 3000 nodes instead of slider value
3. Three conflicting pruning mechanisms
4. Dead code: `forcePruneNodes()` never used
5. Connection pruning doesn't respect connectionLifetime

## Proposed Solution

### Single, Coherent Pruning Strategy

#### **Pruning Event #1: Time-Based Expiration (NEW)**
**When**: Every 1-2 seconds (lightweight check)
**What**: Remove expired connections/nodes based on `connectionLifetime` slider
**Logic**:
```
- Remove connections older than connectionLifetime
- Remove nodes older than connectionLifetime (only if NOT connected)
- Keep pinned nodes always
```

#### **Pruning Event #2: Capacity-Based (when adding)**
**When**: Adding new node and `nodes.length >= maxNodes`
**What**: Make room for new node
**Logic** (keep existing):
```
- Prune to 80% of maxNodes
- Protect nodes with active connections
- Protect pinned nodes
- Remove oldest disconnected nodes
- If no room, reject new node
```

#### **Pruning Event #3: Hard Cap Safety (rare)**
**When**: nodes.length > maxNodes * 1.2 (20% overage)
**What**: Emergency cleanup
**Logic**:
```
- Protect connected + pinned
- Force remove oldest until at maxNodes
```

### Implementation Changes

1. **Hook up `removeInactiveElements()`**
   - Call every 1-2 seconds from a useEffect
   - Use actual connectionLifetime slider value

2. **Fix `limitNetworkSize()` call**
   ```typescript
   // BEFORE (usePacketProcessor.ts:501)
   limitNetworkSize(3000, 5000);

   // AFTER
   const { maxNodes } = useSettingsStore.getState();
   limitNetworkSize(maxNodes, maxNodes * 3);
   ```

3. **Remove dead code**
   - Delete `forcePruneNodes()` function

4. **Simplify connection pruning**
   - Remove inline pruning in `addOrUpdateConnection()`
   - Let `removeInactiveElements()` handle it

## Result

- ✅ Expired elements removed based on connectionLifetime slider
- ✅ Capacity respects maxNodes slider
- ✅ Single source of truth
- ✅ Predictable behavior
- ✅ Less code
