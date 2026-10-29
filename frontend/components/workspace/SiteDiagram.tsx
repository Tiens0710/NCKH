"use client";

export type DiagramNode = { id: string; name: string; zone?: string; x: number; y: number; count?: number; selected?: boolean };
export type DiagramEdge = { from: string; to: string; confirmed?: boolean; directed?: boolean };
export function SiteDiagram({ nodes, edges = [], onSelect, onPlace }: {
  nodes: DiagramNode[]; edges?: DiagramEdge[]; onSelect?: (id: string) => void; onPlace?: (x: number, y: number) => void;
}) {
  const point = (node: DiagramNode) => ({ x: 75 + node.x * 490, y: 65 + node.y * 220 });
  return <div className="ct-diagram-scroll"><svg className={`ct-diagram ${nodes.length ? '' : 'is-empty'}`} viewBox="0 0 640 360" role="img" aria-label="Sơ đồ vị trí các camera và liên kết bằng chứng">
    <defs><pattern id="ct-grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dedede" /></pattern>
      <marker id="ct-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#1d5fbf" /></marker></defs>
    <rect width="640" height="360" fill="#fafafa" />
    <rect width="640" height="360" fill="url(#ct-grid)" onClick={event => {
      if (!onPlace) return;
      const svg = event.currentTarget.ownerSVGElement!;
      const coordinate = svg.createSVGPoint(); coordinate.x = event.clientX; coordinate.y = event.clientY;
      const matrix = svg.getScreenCTM(); if (!matrix) return;
      const local = coordinate.matrixTransform(matrix.inverse());
      onPlace(Math.max(0, Math.min(1, (local.x - 75) / 490)), Math.max(0, Math.min(1, (local.y - 65) / 220)));
    }} />
    {edges.map((edge, index) => {
      const a = nodes.find(node => node.id === edge.from), b = nodes.find(node => node.id === edge.to);
      if (!a || !b) return null;
      const from = point(a), to = point(b);
      return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
        stroke={edge.confirmed ? '#1d5fbf' : '#777'} strokeWidth="2" strokeDasharray={edge.confirmed ? undefined : '6 7'}
        markerEnd={edge.directed ? 'url(#ct-arrow)' : undefined} />;
    })}
    {nodes.map(node => { const position = point(node); return <g key={node.id} transform={`translate(${position.x},${position.y})`}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={node.name}
      onClick={event => { event.stopPropagation(); onSelect?.(node.id); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(node.id); } }}>
      <title>{node.name}{node.zone ? ` · ${node.zone}` : ''}</title>
      <circle r="25" fill="white" stroke={node.selected ? '#1d5fbf' : '#b0b0b0'} strokeWidth={node.selected ? 2 : 1} />
      <rect x="-11" y="-7" width="16" height="14" rx="2" fill="none" stroke={node.selected ? '#1d5fbf' : '#333'} strokeWidth="1.5" />
      <path d="M5,-3 L12,-7 L12,7 L5,3" fill="none" stroke={node.selected ? '#1d5fbf' : '#333'} strokeWidth="1.5" />
      <text textAnchor="middle" y="48" fontSize="14" fill="#171717">{node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name}</text>
      <text textAnchor="middle" y="67" fontSize="12" fill="#626262">{node.count !== undefined ? `${node.count} track` : node.zone || 'Chưa đặt khu vực'}</text>
    </g>; })}
    {!nodes.length ? <text x="320" y="180" textAnchor="middle" fontSize="14" fill="#626262">Thêm camera để tạo sơ đồ khuôn viên</text> : null}
  </svg></div>;
}
