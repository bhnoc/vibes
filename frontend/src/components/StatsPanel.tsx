import React, { memo, useMemo } from 'react';
import { usePacketStore } from '../stores/packetStore';
import { useNetworkStore } from '../stores/networkStore';

// Protocol distribution component
const ProtocolDistribution = memo(({ protocolStats }: { protocolStats: Record<string, number> }) => (
  <div className="protocol-stats">
    <h3>Protocol Distribution</h3>
    <div className="protocol-list">
      {Object.entries(protocolStats).map(([protocol, count]) => (
        <div key={protocol} className="protocol-item">
          <span className="protocol-name">{protocol}</span>
          <span className="protocol-count">{count}</span>
        </div>
      ))}
    </div>
  </div>
));

// Stats grid component
const StatsGrid = memo(({ 
  totalPackets, 
  uniqueNodes, 
  uniqueConnections 
}: { 
  totalPackets: number;
  uniqueNodes: number;
  uniqueConnections: number;
}) => (
  <div className="stats-grid">
    <div className="stat-item">
      <h3>Total Packets</h3>
      <div className="stat-value">{totalPackets}</div>
    </div>
    
    <div className="stat-item">
      <h3>Unique Nodes</h3>
      <div className="stat-value">{uniqueNodes}</div>
    </div>
    
    <div className="stat-item">
      <h3>Connections</h3>
      <div className="stat-value">{uniqueConnections}</div>
    </div>
  </div>
));

// Main StatsPanel component
export const StatsPanel = memo(() => {
  const { packets } = usePacketStore();
  const { nodes, connections } = useNetworkStore();

  // Calculate statistics with useMemo to prevent unnecessary recalculations
  const stats = useMemo(() => {
    // Calculate protocol distribution
    const protocolStats = packets.reduce((acc, packet) => {
      acc[packet.protocol] = (acc[packet.protocol] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPackets: packets.length,
      uniqueNodes: nodes.length,
      uniqueConnections: connections.length,
      protocolStats
    };
  }, [packets, nodes, connections]);

  return (
    <div className="stats-panel">
      <h2>Network Statistics</h2>
      
      <StatsGrid
        totalPackets={stats.totalPackets}
        uniqueNodes={stats.uniqueNodes}
        uniqueConnections={stats.uniqueConnections}
      />

      <ProtocolDistribution protocolStats={stats.protocolStats} />
    </div>
  );
}); 