export interface NetworkInterface {
  Name: string;
  Description: string;
}

export interface Node {
  id: string;
  label: string;
  color: number;
  size: number;
  x?: number;
  y?: number;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  protocol: string;
  size: number;
  timestamp: number;
} 