import { Container, Graphics, Text, TextStyle } from 'pixi.js';

/**
 * Improved ObjectPool with better WebGL resource management
 * This prevents shader errors and memory leaks by properly recycling objects
 */
export class ObjectPool {
  private nodePool: Container[] = [];
  private connectionPool: Graphics[] = [];
  private textPool: Text[] = [];
  private tooltipPool: Container[] = [];
  private textStyleCache = new Map<string, TextStyle>();
  
  // Track allocated objects for better cleanup
  private allocatedNodes = new Set<Container>();
  private allocatedConnections = new Set<Graphics>();
  private allocatedTexts = new Set<Text>();
  
  // Track WebGL resource usage
  private totalAllocations = 0;
  private totalReleases = 0;
  private lastGCTime = 0;
  
  // Getters for allocated object counts
  get nodeCount(): number { return this.allocatedNodes.size; }
  get connectionCount(): number { return this.allocatedConnections.size; }
  get textCount(): number { return this.allocatedTexts.size; }
  
  // Method to release connections only (highly optimized)
  releaseAllConnections(): void {
    const connections = Array.from(this.allocatedConnections);
    connections.forEach(conn => this.releaseConnection(conn));
  }
  
  getNode(): Container {
    this.totalAllocations++;
    
    // Check if we need to do garbage collection
    this.checkGC();
    
    if (this.nodePool.length > 0) {
      const node = this.nodePool.pop()!;
      
      // Ensure the node is in a clean state before reusing
      node.position.set(0, 0);
      node.scale.set(1, 1);
      node.alpha = 1;
      node.visible = true;
      node.angle = 0;
      node.eventMode = 'none';
      
      this.allocatedNodes.add(node);
      return node;
    }
    
    // Create a new container
    const node = new Container();
    this.allocatedNodes.add(node);
    return node;
  }
  
  getConnection(): Graphics {
    this.totalAllocations++;
    
    // Check if we need to do garbage collection
    this.checkGC();
    
    if (this.connectionPool.length > 0) {
      const connection = this.connectionPool.pop()!;
      
      // Reset to clean state before reuse
      connection.clear();
      connection.position.set(0, 0);
      connection.visible = true;
      connection.alpha = 1;
      connection.tint = 0xFFFFFF;
      
      this.allocatedConnections.add(connection);
      return connection;
    }
    
    // Create new graphics
    const graphics = new Graphics();
    this.allocatedConnections.add(graphics);
    return graphics;
  }
  
  getText(style?: TextStyle): Text {
    this.totalAllocations++;
    
    // Check if we need to do garbage collection
    this.checkGC();
    
    // Cache text styles by their properties
    let cachedStyle: TextStyle;
    
    if (style) {
      const styleKey = `${style.fontFamily}-${style.fontSize}-${style.fill}`;
      if (!this.textStyleCache.has(styleKey)) {
        this.textStyleCache.set(styleKey, style);
      }
      cachedStyle = this.textStyleCache.get(styleKey)!;
    } else {
      cachedStyle = new TextStyle();
    }
    
    if (this.textPool.length > 0) {
      const text = this.textPool.pop()!;
      
      // Reset text to clean state
      text.text = '';
      text.style = cachedStyle;
      text.position.set(0, 0);
      text.visible = true;
      text.alpha = 1;
      
      this.allocatedTexts.add(text);
      return text;
    }
    
    // Create new text
    try {
      const text = new Text({ text: '', style: cachedStyle });
      this.allocatedTexts.add(text);
      return text;
    } catch (e) {
      // Fallback with simpler style if there was an error
      console.warn('Error creating text with style, using default instead:', e);
      const text = new Text({ text: '' });
      this.allocatedTexts.add(text);
      return text;
    }
  }
  
  getTooltip(): Container {
    if (this.tooltipPool.length > 0) {
      return this.tooltipPool.pop()!;
    }
    const container = new Container();
    container.visible = false;
    return container;
  }
  
  releaseNode(node: Container) {
    if (!node) return;
    this.totalReleases++;
    
    try {
      // Fast-path: if already destroyed, just clean tracking and return
      if (node.destroyed) {
        this.allocatedNodes.delete(node);
        return;
      }
      
      // Detach from parent with less error-prone method
      if (node.parent) {
        node.parent.removeChild(node);
      }
      
      // Batch remove all listeners with one call
      node.eventMode = 'none'; 
      
      // Reset critical properties only
      node.visible = false;
      node.alpha = 1;
      
      // Handle children in a more optimized way
      if (node.children && node.children.length > 0) {
        // Process in reverse for faster removal
        for (let i = node.children.length - 1; i >= 0; i--) {
          const child = node.children[i];
          if (!child) continue;
          
          // Fast recycle by type
          if (child instanceof Graphics && !child.destroyed) {
            this.releaseConnection(child as Graphics);
          } else if (child instanceof Text && !child.destroyed) {
            this.releaseText(child as Text);
          } else if (child instanceof Container && !child.destroyed) {
            this.releaseNode(child as Container);
          } else if (child.parent) {
            // Last resort for unknown types
            child.parent.removeChild(child);
          }
        }
      }
      
      // Only return to pool if still valid
      if (!node.destroyed) {
        this.allocatedNodes.delete(node);
        // Limit pool size to prevent memory issues
        if (this.nodePool.length < 1000) {
          this.nodePool.push(node);
        }
      } else {
        this.allocatedNodes.delete(node);
      }
    } catch (e) {
      // Just ensure cleanup happens
      this.allocatedNodes.delete(node);
    }
  }
  
  releaseConnection(connection: Graphics) {
    if (!connection) return;
    this.totalReleases++;
    
    try {
      // Fast-path for destroyed objects
      if (connection.destroyed) {
        this.allocatedConnections.delete(connection);
        return;
      }
      
      // Detach from scene
      if (connection.parent) {
        connection.parent.removeChild(connection);
      }
      
      // Clear graphics
      connection.clear();
      
      // Reset essential properties
      connection.visible = false;
      
      // Recycle if still valid
      this.allocatedConnections.delete(connection);
      if (!connection.destroyed && this.connectionPool.length < 1000) {
        this.connectionPool.push(connection);
      }
    } catch (e) {
      this.allocatedConnections.delete(connection);
    }
  }
  
  releaseText(text: Text) {
    if (!text) return;
    this.totalReleases++;
    
    try {
      // Only operate on valid text objects
      if (!text.destroyed) {
        if (text.parent) {
          text.removeFromParent();
        }
        
        text.text = '';
        text.visible = true;
        text.alpha = 1;
        
        this.allocatedTexts.delete(text);
        this.textPool.push(text);
      } else {
        // Just clean up tracking for destroyed objects
        this.allocatedTexts.delete(text);
      }
    } catch (e) {
      console.warn('Error releasing text:', e);
      this.allocatedTexts.delete(text);
    }
  }
  
  releaseTooltip(tooltip: Container) {
    if (!tooltip) return;
    
    try {
      tooltip.removeFromParent();
      tooltip.visible = false;
      
      while (tooltip.children.length > 0) {
        const child = tooltip.children[0];
        child.removeFromParent();
        if (child instanceof Graphics) {
          this.releaseConnection(child);
        } else if (child instanceof Text) {
          this.releaseText(child);
        }
      }
      
      this.tooltipPool.push(tooltip);
    } catch (e) {
      console.warn('Error releasing tooltip:', e);
    }
  }
  
  // Check if we need to do garbage collection
  private checkGC() {
    const now = Date.now();
    const totalObjects = this.allocatedNodes.size + 
                       this.allocatedConnections.size + 
                       this.allocatedTexts.size;
    
    // If we have a lot of objects or it's been a while since last GC
    if (totalObjects > 1000 || now - this.lastGCTime > 10000) {
      // And we've had a lot of allocations relative to releases
      if (this.totalAllocations > this.totalReleases * 1.5) {
        // Log statistics
        console.log(`ObjectPool stats: ${totalObjects} active objects, ${this.totalAllocations} allocations, ${this.totalReleases} releases`);
        console.log(`Pools: ${this.nodePool.length} nodes, ${this.connectionPool.length} connections, ${this.textPool.length} texts`);
        
        // Reset counters
        this.totalAllocations = 0;
        this.totalReleases = 0;
        this.lastGCTime = now;
        
        // Suggest garbage collection to browser
        if (typeof (window as any).gc === 'function') {
          try {
            (window as any).gc();
          } catch (e) {
            // Ignore errors
          }
        }
      }
    }
  }
  
  // Release all allocated objects back to the pool
  releaseAll() {
    try {
      // Release all allocated nodes
      this.allocatedNodes.forEach(node => {
        this.releaseNode(node);
      });
      
      // Release all allocated connections
      this.allocatedConnections.forEach(connection => {
        this.releaseConnection(connection);
      });
      
      // Release all allocated texts
      this.allocatedTexts.forEach(text => {
        this.releaseText(text);
      });
      
      // Reset allocation counters
      this.totalAllocations = 0;
      this.totalReleases = 0;
    } catch (e) {
      console.error('Error in releaseAll:', e);
      // Just reset everything if we got an error
      this.clear();
    }
  }
  
  // Clear pools when switching views
  clear() {
    // Stop tracking objects first
    const allNodes = Array.from(this.allocatedNodes);
    const allConnections = Array.from(this.allocatedConnections);
    const allTexts = Array.from(this.allocatedTexts);
    
    // Clear tracking sets immediately to prevent redundant work
    this.allocatedNodes.clear();
    this.allocatedConnections.clear();
    this.allocatedTexts.clear();
    
    // Process each type separately to avoid cross-contamination
    try {
      // Only detach objects from parents (minimal operation)
      for (const node of allNodes) {
        if (node && !node.destroyed && node.parent) {
          node.parent.removeChild(node);
        }
      }
      
      for (const connection of allConnections) {
        if (connection && !connection.destroyed && connection.parent) {
          connection.parent.removeChild(connection);
        }
      }
      
      for (const text of allTexts) {
        if (text && !text.destroyed && text.parent) {
          text.parent.removeChild(text);
        }
      }
    } catch (e) {
      console.error('Error during clear:', e);
    }
    
    // Reset all collections
    this.nodePool = [];
    this.connectionPool = [];
    this.textPool = [];
    this.tooltipPool = [];
    this.textStyleCache.clear();
    
    // Reset counters
    this.totalAllocations = 0;
    this.totalReleases = 0;
    this.lastGCTime = Date.now();
  }
  
  // Force garbage collection to recover WebGL resources
  forceCleanup(app?: any) {
    // Log the current state
    console.log(`ObjectPool cleanup: ${this.allocatedNodes.size} nodes, ${this.allocatedConnections.size} connections in use`);
    
    // Release all allocated objects back to the pool
    this.releaseAll();
    
    // Clear excess objects from pools to allow garbage collection
    // Keep a reasonable buffer for immediate reuse
    const MAX_POOLED = 500; // Maximum WebGL safe limit
    
    if (this.nodePool.length > MAX_POOLED) {
      console.log(`Trimming node pool from ${this.nodePool.length} to ${MAX_POOLED}`);
      this.nodePool.length = MAX_POOLED;
    }
    
    if (this.connectionPool.length > MAX_POOLED) {
      console.log(`Trimming connection pool from ${this.connectionPool.length} to ${MAX_POOLED}`);
      this.connectionPool.length = MAX_POOLED;
    }
    
    // Try to clear WebGL texture cache as well
    if (app) {
      try {
        // Get access to the Pixi utils
        const cacheSize = Object.keys(app.renderer.texture.managedTextures).length;
        console.log(`Found ${cacheSize} managed textures in Pixi renderer`);
        
        if (cacheSize > 50) {
          console.log(`Freeing texture GPU memory for ${cacheSize} textures`);
          // Destroy all unused textures
          app.renderer.textureGC.run();
        }
      } catch (e) {
        console.log('Failed to access texture cache:', e);
      }
    }
    
    // Suggest garbage collection
    if (typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
        console.log('Manual garbage collection triggered');
      } catch (e) {
        console.log('Failed to trigger manual GC');
      }
    }
    
    // Reset counters
    this.totalAllocations = 0;
    this.totalReleases = 0;
    this.lastGCTime = Date.now();
  }
} 