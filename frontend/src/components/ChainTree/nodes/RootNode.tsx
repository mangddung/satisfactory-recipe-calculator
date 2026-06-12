import { type NodeProps } from '@xyflow/react'
import ProductionNode from './ProductionNode'
import type { FlowNode } from '../flowUtils'

export default function RootNode(props: NodeProps<FlowNode>) {
  return <ProductionNode {...props} isRoot />
}
