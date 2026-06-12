import { BaseEdge, getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

function fmtRate(r: number): string {
  if (r === 0) return '0'
  if (r === Math.floor(r)) return r.toString()
  return parseFloat(r.toFixed(2)).toString()
}

export default function ConveyorEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const throughput: number = (data?.throughput as number) ?? 0
  const limit: number = (data?.conveyorLimit as number) ?? Infinity
  const isDashed: boolean = (data?.isDashed as boolean) ?? false

  const over = isFinite(limit) && throughput > limit
  const near = isFinite(limit) && !over && throughput > limit * 0.8
  const stroke = isDashed ? '#3a3a5a' : over ? '#cc4444' : near ? '#cc8844' : '#2a4a6a'
  const labelColor = isDashed ? '#5a5a7a' : over ? '#ff6666' : '#7ab8b8'

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke,
          strokeWidth: isDashed ? 1 : 1.5,
          strokeDasharray: isDashed ? '4 3' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 10,
            color: labelColor,
            background: '#0a0a14',
            padding: '1px 5px',
            borderRadius: 3,
            pointerEvents: 'none',
            border: over ? '1px solid #cc444466' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {over && '⚠ '}{fmtRate(throughput)}/min
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
